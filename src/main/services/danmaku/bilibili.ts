import type {
  CommentModel,
  LinkIdentity,
  LinkProgress,
  LinkResult,
  LinkSelection,
} from '@marchen/shared/danmaku'
import { setTimeout as delay } from 'node:timers/promises'
import { parseStringPromise } from 'xml2js'

const API = 'https://api.bilibili.com'
export const BILIBILI_LIMITS = {
  responseBytes: 4 * 1024 * 1024,
  resultBytes: 10 * 1024 * 1024,
  comments: 100000,
  episodes: 1000,
}
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('B 站接口响应结构异常')
  return value as Record<string, unknown>
}
const id = (value: unknown): string => {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value <= 0))
    throw new Error('B 站视频标识无效')
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    !/^[1-9]\d{0,15}$/.test(String(value))
  )
    throw new Error('B 站视频标识无效')
  return String(value)
}
const title = (value: unknown, fallback: string) =>
  typeof value === 'string' && value.trim() ? value.slice(0, 300) : fallback

export function recognizeBilibili(input: string): LinkIdentity | null {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return null
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    !['www.bilibili.com', 'bilibili.com', 'm.bilibili.com'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port
  )
    return null
  const bv = /^\/video\/(BV[0-9A-Za-z]{10})\/?$/.exec(url.pathname)?.[1]
  if (bv) {
    const pages = url.searchParams.getAll('p')
    const page = pages[0] ?? '1'
    if (pages.length > 1 || !/^[1-9]\d{0,5}$/.test(page)) return null
    return {
      provider: 'bilibili',
      videoId: `${bv}:p${page}`,
      canonicalUrl: `https://www.bilibili.com/video/${bv}/?p=${page}`,
    }
  }
  const episode = /^\/bangumi\/play\/((?:ep|ss)[1-9]\d{0,15})\/?$/.exec(url.pathname)?.[1]
  return episode
    ? {
        provider: 'bilibili',
        videoId: episode,
        canonicalUrl: `https://www.bilibili.com/bangumi/play/${episode}`,
      }
    : null
}

/** 独立匿名请求，只允许固定接口；fetch 已负责 HTTP 解压，预算针对解压后的数据。 */
export class BilibiliClient {
  constructor(
    private signal: AbortSignal,
    private fetcher: typeof fetch = fetch,
  ) {}
  async request(url: string): Promise<string> {
    const target = new URL(url)
    if (
      target.protocol !== 'https:' ||
      !['api.bilibili.com', 'comment.bilibili.com'].includes(target.hostname) ||
      target.username ||
      target.password ||
      target.port
    )
      throw new Error('B 站接口地址不受支持')
    for (let attempt = 0; attempt < 3; attempt++) {
      this.signal.throwIfAborted()
      const timeout = AbortSignal.timeout(20000)
      try {
        const response = await this.fetcher(url, {
          redirect: 'error',
          signal: AbortSignal.any([this.signal, timeout]),
          headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.bilibili.com/' },
        })
        if (!response.ok) {
          await response.body?.cancel()
          if (response.status >= 500 && attempt < 2) {
            await delay(500 * (attempt + 1), undefined, { signal: this.signal })
            continue
          }
          throw new Error(`B 站弹幕接口 HTTP ${response.status}，请稍后重试`)
        }
        const reader = response.body?.getReader()
        if (!reader) throw new Error('B 站接口没有响应内容')
        const chunks: Uint8Array[] = []
        let bytes = 0
        try {
          while (true) {
            const next = await reader.read()
            if (next.done) break
            bytes += next.value.byteLength
            if (bytes > BILIBILI_LIMITS.responseBytes) throw new Error('B 站响应超过大小限制')
            chunks.push(next.value)
          }
        } finally {
          await reader.cancel().catch(() => {})
          reader.releaseLock()
        }
        this.signal.throwIfAborted()
        return Buffer.concat(chunks).toString('utf8')
      } catch (error) {
        this.signal.throwIfAborted()
        if (timeout.aborted || error instanceof TypeError) {
          if (attempt < 2) {
            await delay(500 * (attempt + 1), undefined, { signal: this.signal })
            continue
          }
          throw new Error('B 站网络请求失败，请稍后重试')
        }
        throw error
      }
    }
    throw new Error('B 站网络请求失败')
  }
  async metadata(path: string, field: 'data' | 'result') {
    let raw: unknown
    try {
      raw = JSON.parse(await this.request(`${API}${path}`)) as unknown
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error('B 站接口返回异常，请稍后重试')
      throw error
    }
    const response = object(raw)
    if (response.code !== 0) throw new Error('无法读取 B 站视频信息，视频可能不可用或请求受限')
    return object(response[field])
  }
}

/** 不执行高级/代码弹幕，平台长 ID 只作字符串去重，避免精度丢失。 */
export async function convertBilibiliXml(text: string, cid: string) {
  if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(text)) throw new Error('B 站弹幕 XML 格式不受支持')
  let parsed: unknown
  try {
    parsed = (await parseStringPromise(text, { explicitArray: true, strict: true })) as unknown
  } catch {
    throw new Error('B 站弹幕 XML 解析失败')
  }
  const root = object(object(parsed).i)
  if (!Array.isArray(root.chatid) || root.chatid[0] !== cid)
    throw new Error('B 站弹幕视频标识不匹配')
  if (Array.isArray(root.state) && root.state[0] !== '0') throw new Error('该视频弹幕已关闭')
  const rows = root.d ?? []
  if (!Array.isArray(rows)) throw new Error('B 站弹幕结构异常')
  if (rows.length > BILIBILI_LIMITS.comments) throw new Error('B 站弹幕数量超过读取限制')
  const comments: CommentModel[] = []
  const seen = new Set<string>()
  let skipped = 0
  for (const raw of rows) {
    try {
      const row = object(raw)
      const p = object(row.$).p
      if (typeof p !== 'string' || typeof row._ !== 'string' || !row._.trim())
        throw new Error('无效弹幕记录')
      const fields = p.split(',')
      const [time, mode, , color] = fields.map(Number)
      if (
        fields.length < 8 ||
        !fields[0].trim() ||
        !Number.isFinite(time) ||
        time < 0 ||
        ![1, 2, 3, 4, 5].includes(mode) ||
        !fields[3].trim() ||
        !Number.isInteger(color) ||
        color < 0 ||
        color > 0xFFFFFF ||
        !/^\d+$/.test(fields[7])
      )
        throw new Error('无效弹幕记录')
      if (seen.has(fields[7])) continue
      seen.add(fields[7])
      comments.push({
        cid: comments.length + 1,
        m: row._,
        p: `${time},${mode <= 3 ? 1 : mode},${color},0`,
      })
    } catch {
      skipped++
    }
  }
  if (!comments.length) throw new Error('该链接没有可导入的普通弹幕')
  comments.sort((a, b) => Number(a.p.split(',')[0]) - Number(b.p.split(',')[0]))
  if (Buffer.byteLength(JSON.stringify(comments)) > BILIBILI_LIMITS.resultBytes)
    throw new Error('B 站弹幕结果超过大小限制')
  return { content: { count: comments.length, comments }, skipped }
}

export async function fetchBilibili(
  input: LinkIdentity,
  signal: AbortSignal,
  progress: (value: Omit<LinkProgress, 'requestId'>) => void,
  fetcher?: typeof fetch,
): Promise<LinkResult | LinkSelection> {
  const identity = recognizeBilibili(input.canonicalUrl)
  if (!identity) throw new Error('不支持此 B 站链接')
  const client = new BilibiliClient(signal, fetcher)
  progress({ stage: 'metadata', completed: 0, count: 0 })
  let cid: string
  let label: string
  if (identity.videoId.startsWith('BV')) {
    const [bv, pageText] = identity.videoId.split(':p')
    const data = await client.metadata(`/x/web-interface/view?bvid=${bv}`, 'data')
    if (!Array.isArray(data.pages)) throw new Error('无法读取 B 站分 P 列表')
    const page = data.pages.map(object).find((value) => value.page === Number(pageText))
    if (!page) throw new Error(`该视频不存在第 ${pageText} P`)
    cid = id(page.cid)
    label = `${title(data.title, bv)} · P${pageText} ${title(page.part, '')}`.trim()
  } else {
    const isSeason = identity.videoId.startsWith('ss')
    const targetId = identity.videoId.slice(2)
    const data = await client.metadata(
      `/pgc/view/web/season?${isSeason ? 'season_id' : 'ep_id'}=${targetId}`,
      'result',
    )
    if (!Array.isArray(data.episodes) || !data.episodes.length)
      throw new Error('该番剧没有可读取的正片剧集')
    if (data.episodes.length > BILIBILI_LIMITS.episodes) throw new Error('番剧剧集数量超过读取限制')
    const episodes = data.episodes.map(object)
    const seasonTitle = title(data.title, 'B 站番剧')
    const episodeTitle = (ep: Record<string, unknown>) =>
      `${seasonTitle} · 第 ${title(ep.title, id(ep.id))} 集 ${title(ep.long_title, '')}`.trim()
    if (isSeason) {
      signal.throwIfAborted()
      return {
        title: seasonTitle,
        episodes: episodes.map((ep) => ({
          title: episodeTitle(ep),
          url: `https://www.bilibili.com/bangumi/play/ep${id(ep.id)}`,
        })),
      }
    }
    const episode = episodes.find((ep) => id(ep.id) === targetId)
    if (!episode) throw new Error('未找到指定番剧单集')
    cid = id(episode.cid)
    label = episodeTitle(episode)
  }
  const converted = await convertBilibiliXml(
    await client.request(`https://comment.bilibili.com/${cid}.xml`),
    cid,
  )
  signal.throwIfAborted()
  progress({
    stage: 'comments',
    title: label,
    completed: 1,
    total: 1,
    count: converted.content.count,
  })
  return { identity: { ...identity, videoId: cid }, title: label, ...converted, segments: 1 }
}
