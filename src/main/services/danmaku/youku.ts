import type { CommentModel, LinkIdentity, LinkProgress, LinkResult } from '@marchen/shared/danmaku'
import { createHash } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'

const APP_KEY = '24679788'
const API = 'https://acs.youku.com/h5/'
const md5 = (value: string) => createHash('md5').update(value).digest('hex')
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('弹幕接口响应结构异常')
  return value as Record<string, unknown>
}
const decode = (value: unknown) =>
  typeof value === 'string' ? (JSON.parse(value) as unknown) : value
export const LIMITS = {
  responseBytes: 4 * 1024 * 1024,
  resultBytes: 10 * 1024 * 1024,
  comments: 100000,
  segments: 360,
}

export function recognizeYouku(input: string): LinkIdentity | null {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return null
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.hostname !== 'v.youku.com' ||
    url.username ||
    url.password ||
    url.port
  )
    return null
  const videoId =
    /^\/v_show\/id_(X[A-Za-z0-9=]+)\.html$/.exec(url.pathname)?.[1] ?? url.searchParams.get('vid')
  if (!videoId || !/^X[A-Za-z0-9=]+$/.test(videoId) || videoId.length > 128) return null
  return {
    provider: 'youku',
    videoId,
    canonicalUrl: `https://v.youku.com/v_show/id_${videoId}.html`,
  }
}

/** 任务内匿名凭据，只发给固定 ACS 主机，不接触用户登录 session。 */
export class AnonymousClient {
  private cookies = new Map<string, string>()
  constructor(
    private signal: AbortSignal,
    private fetcher: typeof fetch = fetch,
  ) {}
  token() {
    return this.cookies.get('_m_h5_tk')?.split('_')[0]
  }
  async request(url: string, body?: URLSearchParams): Promise<unknown> {
    const host = new URL(url).hostname
    if (
      !['acs.youku.com', 'openapi.youku.com'].includes(host) ||
      new URL(url).protocol !== 'https:'
    )
      throw new Error('接口地址不受支持')
    for (let attempt = 0; attempt < 3; attempt++) {
      this.signal.throwIfAborted()
      const timeout = AbortSignal.timeout(20000)
      try {
        const response = await this.fetcher(url, {
          method: body ? 'POST' : 'GET',
          body,
          redirect: 'error',
          signal: AbortSignal.any([this.signal, timeout]),
          headers: {
            'User-Agent': 'Mozilla/5.0',
            Referer: 'https://v.youku.com/',
            ...(host === 'acs.youku.com'
              ? { Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }
              : {}),
          },
        })
        if (!response.ok) {
          await response.body?.cancel()
          if (response.status >= 500 && attempt < 2) {
            await delay((attempt + 1) * 1000, undefined, { signal: this.signal })
            continue
          }
          throw new Error(`弹幕接口 HTTP ${response.status}`)
        }
        if (host === 'acs.youku.com') {
          for (const cookie of response.headers.getSetCookie()) {
            const pair = cookie.split(';')[0]
            const split = pair.indexOf('=')
            const key = pair.slice(0, split)
            if (['_m_h5_tk', '_m_h5_tk_enc'].includes(key))
              this.cookies.set(key, pair.slice(split + 1))
          }
        }
        const reader = response.body?.getReader()
        if (!reader) throw new Error('弹幕接口没有响应内容')
        const chunks: Uint8Array[] = []
        let length = 0
        try {
          while (true) {
            const next = await reader.read()
            if (next.done) break
            length += next.value.byteLength
            if (length > LIMITS.responseBytes) throw new Error('弹幕响应超过大小限制')
            chunks.push(next.value)
          }
        } finally {
          await reader.cancel().catch(() => {})
          reader.releaseLock()
        }
        // 大整数 ID 在 JSON.parse 前保留字符串，不能先损失精度再 String()。
        const text = Buffer.concat(chunks)
          .toString('utf8')
          .replace(/("id"\s*:\s*)(\d{16,})(?=\s*[,}])/g, '$1"$2"')
        try {
          return JSON.parse(text) as unknown
        } catch {
          throw new Error('弹幕接口响应不是有效 JSON')
        }
      } catch (error) {
        this.signal.throwIfAborted()
        if ((timeout.aborted || error instanceof TypeError) && attempt < 2) {
          await delay((attempt + 1) * 1000, undefined, { signal: this.signal })
          continue
        }
        // 不把 fetch 的签名 URL、Cookie 或底层异常附带信息传播到 UI。
        if (timeout.aborted || error instanceof TypeError)
          throw new Error('弹幕网络请求失败，请稍后重试')
        throw error
      }
    }
    throw new Error('弹幕网络请求失败')
  }
}

export function convertRows(rows: unknown[], seen: Set<string>, startId: number) {
  const comments: CommentModel[] = []
  let skipped = 0
  for (const raw of rows) {
    try {
      const row = object(raw)
      const time = Number(row.playat) / 1000
      if (
        row.playat == null ||
        !Number.isFinite(time) ||
        time < 0 ||
        typeof row.content !== 'string' ||
        !row.content.trim()
      )
        throw new Error('无效数据')
      const properties = object(decode(row.propertis || '{}'))
      const value = properties.color ?? 0xFFFFFF
      if (typeof value === 'string' && !/^(?:#[0-9a-f]{1,8}|[0-9a-f]{1,10})$/i.test(value)) throw new Error('颜色无效')
      const color =
        typeof value === 'string' && (value.startsWith('#') || /[a-f]/i.test(value))
          ? Number.parseInt(value.replace(/^#/, ''), 16)
          : Number(value)
      if (!Number.isSafeInteger(color) || color < 0 || color > 0xFFFFFFFF) throw new Error('无效数据')
      if (typeof row.id === 'number' && !Number.isSafeInteger(row.id)) throw new Error('无效数据')
      const rgb = color & 0xFFFFFF
      const key = row.id != null ? `id:${String(row.id)}` : JSON.stringify([time, row.content, rgb])
      if (seen.has(key)) continue
      seen.add(key)
      comments.push({
        cid: startId + comments.length,
        m: row.content,
        p: `${time},1,#${rgb.toString(16).padStart(6, '0')},0`,
      })
    } catch {
      skipped++
    }
  }
  return { comments, skipped }
}

export async function fetchYouku(
  identity: LinkIdentity,
  signal: AbortSignal,
  progress: (value: Omit<LinkProgress, 'requestId'>) => void,
  fetcher?: typeof fetch,
): Promise<LinkResult> {
  const client = new AnonymousClient(signal, fetcher)
  progress({ stage: 'metadata', completed: 0, count: 0 })
  const meta = object(
    await client.request(
      `https://openapi.youku.com/v2/videos/show.json?${
        new URLSearchParams({
          client_id: '53e6cc67237fc59a',
          video_id: identity.videoId,
          package: 'com.huawei.hwvplayer.youku',
          ext: 'show',
        })}`,
    ),
  )
  const duration = Number(meta.duration)
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('无法确定视频时长')
  const total = Math.floor(duration / 60) + 1
  if (total > LIMITS.segments) throw new Error('视频时长超过弹幕读取限制')
  const title = typeof meta.title === 'string' ? meta.title.slice(0, 300) : identity.videoId
  await client.request(`${API}mtop.com.youku.aplatform.weakget/1.0/?jsv=2.5.1&appKey=${APP_KEY}`)
  if (!client.token()) throw new Error('无法取得匿名接口令牌，请稍后重试')
  const comments: CommentModel[] = []
  const seen = new Set<string>()
  let skipped = 0
  let bytes = 0
  for (let minute = 0; minute < total; minute++) {
    signal.throwIfAborted()
    const message = {
      ctime: Date.now(),
      ctype: 10004,
      cver: 'v1.0',
      guid: '',
      mat: minute,
      mcount: 1,
      pid: 0,
      sver: '3.1.0',
      type: 1,
      vid: identity.videoId,
    }
    const encoded = Buffer.from(JSON.stringify(message)).toString('base64')
    const data = JSON.stringify({
      ...message,
      msg: encoded,
      sign: md5(`${encoded  }MkmC9SoIw6xCkSKHhJ7b5D2r51kBiREr`),
    })
    const now = String(Date.now())
    const query = new URLSearchParams({
      jsv: '2.5.6',
      appKey: APP_KEY,
      t: now,
      sign: md5([client.token(), now, APP_KEY, data].join('&')),
      api: 'mopen.youku.danmu.list',
      v: '1.0',
      type: 'originaljson',
      dataType: 'jsonp',
      timeout: '20000',
    })
    const response = object(
      await client.request(
        `${API}mopen.youku.danmu.list/1.0/?${query}`,
        new URLSearchParams({ data }),
      ),
    )
    const outer = object(response.data)
    if (outer.result == null)
      throw new Error(`第 ${minute + 1} 段读取失败，接口令牌失效或请求被拒绝，请稍后重试`)
    // result 有时为二次编码 JSON，也保留其中的大整数 ID。
    const result = object(
      typeof outer.result === 'string'
        ? JSON.parse(outer.result.replace(/("id"\s*:\s*)(\d{16,})(?=\s*[,}])/g, '$1"$2"'))
        : outer.result,
    )
    const rows = object(result.data).result
    if (!Array.isArray(rows)) throw new Error(`第 ${minute + 1} 段弹幕结构异常`)
    const converted = convertRows(rows, seen, comments.length + 1)
    skipped += converted.skipped
    bytes += Buffer.byteLength(JSON.stringify(converted.comments))
    if (bytes > LIMITS.resultBytes || comments.length + converted.comments.length > LIMITS.comments)
      throw new Error('弹幕数量或大小超过读取限制')
    comments.push(...converted.comments)
    progress({ stage: 'comments', title, completed: minute + 1, total, count: comments.length })
  }
  signal.throwIfAborted()
  if (!comments.length) throw new Error('该链接没有可导入的有效弹幕')
  comments.sort((a, b) => Number(a.p.split(',')[0]) - Number(b.p.split(',')[0]))
  return {
    identity,
    title,
    content: { count: comments.length, comments },
    skipped,
    segments: total,
  }
}
