import type {
  BrowseNode,
  BrowseVideoNode,
  ProviderSubtitle,
  ProviderSubtitleFormat,
} from '@marchen/shared/media-sources'
import type { MediaSourceProvider, ProviderFactory } from './provider'
import { createAuthorizedFetcher } from '@main/lib/remote-media'
import { isVideoFile } from '@marchen/shared/media'
import { MediaSourceError } from '@marchen/shared/media-sources'
import { XMLParser } from 'fast-xml-parser'
import {
  naturalCompare,
  normalizeServerUrl,
  providerRequest,
  readLimitedText,
  SUBTITLE_SIZE_LIMIT,
} from './provider'

const SUBTITLE_FORMATS: ProviderSubtitleFormat[] = ['ass', 'ssa', 'srt', 'vtt']

const PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/></d:prop></d:propfind>`

export interface WebdavEntry {
  /** 相对根地址的解码路径，以 / 开头；目录不带结尾斜杠 */
  ref: string
  name: string
  directory: boolean
  size?: number
}

const parser = new XMLParser({
  // 不同服务端的命名空间前缀不同（d: / D: / lp1: / 无前缀），统一去掉
  removeNSPrefix: true,
  ignoreAttributes: true,
  parseTagValue: false,
  isArray: (name) => name === 'response' || name === 'propstat',
})

const decodePath = (value: string) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const trimSlashes = (value: string) => value.replace(/\/+$/, '')

/**
 * 解析 PROPFIND multistatus。href 可能是绝对地址或绝对路径、可能已编码，
 * 统一解码后与根路径比较，得到相对引用；根之外的条目丢弃。
 */
export function parseMultistatus(xml: string, root: URL): WebdavEntry[] {
  let document: unknown
  try {
    document = parser.parse(xml)
  } catch {
    throw new MediaSourceError('invalid_response')
  }
  const responses = (document as { multistatus?: { response?: unknown[] } })?.multistatus?.response
  if (!Array.isArray(responses)) throw new MediaSourceError('invalid_response')
  const rootPath = trimSlashes(decodePath(root.pathname))
  const entries: WebdavEntry[] = []
  for (const response of responses as Array<Record<string, unknown>>) {
    const href = typeof response.href === 'string' ? response.href.trim() : ''
    if (!href) continue
    const path = trimSlashes(decodePath(new URL(href, root).pathname))
    if (path !== rootPath && !path.startsWith(`${rootPath}/`)) continue
    const propstats = (response.propstat as Array<Record<string, unknown>> | undefined) ?? []
    const ok = propstats.find((item) => String(item.status ?? '').includes(' 200')) ?? propstats[0]
    const prop = (ok?.prop ?? {}) as Record<string, unknown>
    const resourcetype = prop.resourcetype
    const directory =
      typeof resourcetype === 'object' && resourcetype !== null && 'collection' in resourcetype
    const length = Number(prop.getcontentlength)
    const ref = path.slice(rootPath.length) || '/'
    entries.push({
      ref,
      name: ref === '/' ? '' : ref.split('/').pop()!,
      directory: directory || ref === '/',
      size: Number.isSafeInteger(length) && length >= 0 ? length : undefined,
    })
  }
  return entries
}

/** 引用 → 上游地址；逐段编码，拒绝 . 与 .. 以免越出根目录。 */
export function webdavUrl(root: URL, ref: string, directory = false): string {
  const segments = ref.split('/').filter(Boolean)
  if (segments.some((segment) => segment === '.' || segment === '..'))
    throw new MediaSourceError('invalid_input', '路径无效')
  const relative = segments.map(encodeURIComponent).join('/')
  return new URL(relative + (directory && relative ? '/' : ''), root).href
}

const parentOf = (ref: string) => ref.slice(0, ref.lastIndexOf('/')) || '/'
const extension = (name: string) => name.slice(name.lastIndexOf('.') + 1).toLowerCase()

export function sortEntries(entries: WebdavEntry[]) {
  return entries.sort((a, b) =>
    a.directory === b.directory ? naturalCompare(a.name, b.name) : a.directory ? -1 : 1,
  )
}

export function createWebdavProvider(
  rootUrl: string,
  username: string,
  password: string,
): MediaSourceProvider {
  const root = new URL(rootUrl)
  const auth: Record<string, string> =
    username || password
      ? { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` }
      : {}
  const fetcher = createAuthorizedFetcher(auth, root.origin)

  async function propfind(ref: string, depth: 0 | 1, directory: boolean) {
    const response = await providerRequest(fetcher, webdavUrl(root, ref, directory), {
      method: 'PROPFIND',
      headers: { Depth: String(depth), 'Content-Type': 'application/xml; charset=utf-8' },
      body: PROPFIND_BODY,
    })
    if (response.status !== 207) {
      await response.body?.cancel()
      throw new MediaSourceError('invalid_response', '服务器不是有效的 WebDAV 服务')
    }
    return parseMultistatus(await readLimitedText(response, 16 * 1024 * 1024), root)
  }

  async function children(ref: string) {
    const self = trimSlashes(ref) || '/'
    return (await propfind(self, 1, true))
      .filter((entry) => entry.ref !== self && !entry.name.startsWith('.'))
      .filter((entry, index, all) => all.findIndex((item) => item.ref === entry.ref) === index)
  }

  const toNode = (entry: WebdavEntry): BrowseNode =>
    entry.directory
      ? { type: 'folder', ref: entry.ref, title: entry.name }
      : { type: 'video', ref: entry.ref, title: entry.name, size: entry.size }

  async function subtitleEntries(itemRef: string) {
    const name = itemRef.split('/').pop() ?? ''
    // 与本地外挂字幕发现规则一致：文件名第一个点之前的部分作为前缀
    const prefix = name.split('.')[0]
    return (await children(parentOf(itemRef))).filter(
      (entry) =>
        !entry.directory &&
        entry.name.startsWith(prefix) &&
        SUBTITLE_FORMATS.includes(extension(entry.name) as ProviderSubtitleFormat),
    )
  }

  return {
    origin: root.origin,
    authHeaders: () => auth,
    async browse(ref) {
      const current = ref ?? '/'
      const nodes = sortEntries(
        (await children(current)).filter((entry) => entry.directory || isVideoFile(entry.name)),
      ).map(toNode)
      return { title: current === '/' ? '' : current.split('/').pop()!, nodes }
    },
    async resolvePlayback(itemRef) {
      if (!isVideoFile(itemRef)) throw new MediaSourceError('invalid_input', '不支持的视频格式')
      // 先确认文件仍存在且凭证有效：范围读取阶段拿不到 401 / 404 的区别
      const [entry] = await propfind(itemRef, 0, false)
      if (!entry || entry.directory) throw new MediaSourceError('not_found')
      return { url: webdavUrl(root, itemRef), name: itemRef.split('/').pop()! }
    },
    async siblings(itemRef) {
      return sortEntries(
        (await children(parentOf(itemRef))).filter(
          (entry) => !entry.directory && isVideoFile(entry.name),
        ),
      ).map(toNode) as BrowseVideoNode[]
    },
    async subtitles(itemRef): Promise<ProviderSubtitle[]> {
      return sortEntries(await subtitleEntries(itemRef)).map((entry) => ({
        id: entry.name,
        title: entry.name,
        format: extension(entry.name) as ProviderSubtitleFormat,
      }))
    },
    async readSubtitle(itemRef, subtitleId) {
      // 只允许读取 subtitles() 列出的同目录文件，不接受任意路径
      const entry = (await subtitleEntries(itemRef)).find((item) => item.name === subtitleId)
      if (!entry) throw new MediaSourceError('not_found')
      const response = await providerRequest(fetcher, webdavUrl(root, entry.ref))
      return readLimitedText(response, SUBTITLE_SIZE_LIMIT)
    },
  }
}

export const webdavFactory: ProviderFactory = {
  async connect(input) {
    const url = normalizeServerUrl(input.url, true).href
    const provider = createWebdavProvider(url, input.username, input.password)
    await provider.browse(null)
    return { url, credential: { type: 'basic', password: input.password } }
  },
  create(source) {
    if (source.credential.type !== 'basic') throw new MediaSourceError('auth_failed')
    return createWebdavProvider(source.url, source.username, source.credential.password)
  },
}
