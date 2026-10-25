import type {
  BrowseResult,
  BrowseVideoNode,
  MediaSourceKind,
  ProviderSubtitle,
  SourceImageKind,
} from '@marchen/shared/media-sources'
import type { MediaSourceCredential, MediaSourceRecord } from './store'
import { MediaSourceError } from '@marchen/shared/media-sources'
import { errorForStatus, toMediaSourceError } from './errors'

export const PROVIDER_TIMEOUT = 15_000
/** 字幕正文上限，与外挂字幕的持久化预算同量级，避免把异常大文件读进内存 */
export const SUBTITLE_SIZE_LIMIT = 8 * 1024 * 1024

/** 主进程内部使用的播放目标：上游地址与鉴权头不出主进程。 */
export interface ResolvedPlayback {
  url: string
  name: string
}

export interface MediaSourceProvider {
  /** 鉴权头只发往该 origin */
  readonly origin: string
  authHeaders: () => Record<string, string>
  browse: (ref: string | null) => Promise<BrowseResult>
  resolvePlayback: (itemRef: string) => Promise<ResolvedPlayback>
  /** 同目录或同季视频，顺序与浏览界面一致 */
  siblings: (itemRef: string) => Promise<BrowseVideoNode[]>
  subtitles: (itemRef: string) => Promise<ProviderSubtitle[]>
  readSubtitle: (itemRef: string, subtitleId: string) => Promise<string>
  /** 海报上游地址；不支持海报的来源返回 undefined */
  imageUrl?: (itemId: string, kind: SourceImageKind, width: number, tag: string) => string
}

export interface ConnectInput {
  url: string
  username: string
  password: string
}

export interface ProviderFactory {
  /** 规范化地址并验证连接；成功时返回要保存的凭证 */
  connect: (
    input: ConnectInput,
    deviceId: string,
  ) => Promise<{ url: string; credential: MediaSourceCredential }>
  create: (source: MediaSourceRecord, deviceId: string) => MediaSourceProvider
}

export type ProviderFactories = Record<MediaSourceKind, ProviderFactory>

/** 只接受不含账号密码的 HTTP(S) 地址；凭证一律走请求头。 */
export function normalizeServerUrl(value: string, trailingSlash: boolean): URL {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new MediaSourceError('invalid_input', '请输入有效的服务器地址')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new MediaSourceError('invalid_input', '服务器地址只支持不含账号密码的 HTTP/HTTPS 地址')
  url.hash = ''
  url.search = ''
  url.pathname = url.pathname.replace(/\/+$/, '') + (trailingSlash ? '/' : '')
  return url
}

/** provider 的 API 请求：统一超时、状态码与网络错误映射。 */
export async function providerRequest(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit = {},
  timeout = PROVIDER_TIMEOUT,
): Promise<Response> {
  let response: Response
  try {
    response = await fetcher(url, {
      ...init,
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(timeout)])
        : AbortSignal.timeout(timeout),
    })
  } catch (error) {
    throw toMediaSourceError(error)
  }
  if (!response.ok && response.status !== 207) {
    await response.body?.cancel()
    throw errorForStatus(response.status)
  }
  return response
}

/** 读取有上限的响应体，超过上限即中止，不把异常大的响应读进内存。 */
export async function readLimitedBytes(response: Response, limit: number): Promise<Uint8Array> {
  const length = Number(response.headers.get('Content-Length'))
  if (Number.isFinite(length) && length > limit) {
    await response.body?.cancel()
    throw new MediaSourceError('invalid_response', '文件过大')
  }
  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel()
      throw new MediaSourceError('invalid_response', '文件过大')
    }
    chunks.push(value)
  }
  return new Uint8Array(Buffer.concat(chunks))
}

export const readLimitedText = async (response: Response, limit: number) =>
  new TextDecoder().decode(await readLimitedBytes(response, limit))

const collator = new Intl.Collator('zh-Hans', { numeric: true, sensitivity: 'base' })
/** 自然排序：「EP2」排在「EP10」之前 */
export const naturalCompare = (a: string, b: string) => collator.compare(a, b)
