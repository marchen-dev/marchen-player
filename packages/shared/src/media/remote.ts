/** 网络来源统一错误只携带安全文案，不把签名地址拼入异常。 */
export class RemoteMediaError extends Error {
  constructor(
    public readonly code: 'access' | 'range' | 'changed' | 'unsupported',
    message: string,
  ) {
    super(message)
    this.name = 'RemoteMediaError'
  }
}

export const REMOTE_LIMITS = {
  chunk: 32 * 1024 * 1024,
  timeout: 15_000,
  retries: 2,
  redirects: 5,
  concurrency: 2,
  fingerprintTimeout: 30_000,
  playbackTimeout: 45_000,
} as const
export function validateRemoteUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new RemoteMediaError('unsupported', '请输入有效的视频链接')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new RemoteMediaError('unsupported', '仅支持不含账号密码的 HTTP/HTTPS 视频直链')
  if (/\.(?:m3u8|mpd)$/i.test(url.pathname))
    throw new RemoteMediaError('unsupported', '暂不支持播放清单，请输入视频文件直链')
  url.hash = ''
  return url.href
}

export function remoteName(url: string, disposition?: string | null): string {
  const raw =
    disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1] ??
    disposition?.match(/filename="([^"]+)"/i)?.[1] ??
    new URL(url).pathname.split('/').pop() ??
    ''
  let name = raw
  try {
    name = decodeURIComponent(raw)
  } catch {
    /* 保留不能解码的名称。 */
  }
  return (
    name
      .split(/[\\/]/)
      .pop()
      ?.split('')
      .filter((character) => character.charCodeAt(0) >= 32)
      .join('')
      .slice(0, 240) || '网络视频'
  )
}

export interface RemoteRangeSource {
  size: number
  name: string
  url: string
  read: (start: number, end: number, signal?: AbortSignal) => Promise<Uint8Array<ArrayBuffer>>
  stream: (
    start: number,
    end: number,
    signal?: AbortSignal,
  ) => Promise<ReadableStream<Uint8Array<ArrayBuffer>>>
  close: () => void
}

/** 只接受完整的单范围响应；不退回顺序下载。 */
export async function openRemoteRangeSource(
  value: string,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<RemoteRangeSource> {
  let url = validateRemoteUrl(value)
  const controller = new AbortController()
  const lifetime = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
  let size = 0
  let etag: string | null = null
  let modified: string | null = null
  let active = 0
  const queue: Array<() => void> = []
  async function acquire(requestSignal: AbortSignal) {
    requestSignal.throwIfAborted()
    if (active < REMOTE_LIMITS.concurrency) {
      active++
      return
    }
    await new Promise<void>((resolve, reject) => {
      const resume = () => {
        requestSignal.removeEventListener('abort', abort)
        resolve()
      }
      const abort = () => {
        const i = queue.indexOf(resume)
        if (i >= 0) queue.splice(i, 1)
        reject(requestSignal.reason)
      }
      queue.push(resume)
      requestSignal.addEventListener('abort', abort, { once: true })
    })
  }
  function release() {
    const next = queue.shift()
    if (next) next()
    else active--
  }
  async function request(start: number, end: number, caller?: AbortSignal, streaming = false) {
    const combined = caller ? AbortSignal.any([lifetime, caller]) : lifetime
    await acquire(combined)
    let handedOff = false
    try {
      for (let attempt = 0; ; attempt++) {
        combined.throwIfAborted()
        const requestAbort = new AbortController()
        let timer = setTimeout(() => requestAbort.abort(), REMOTE_LIMITS.timeout)
        const requestSignal = AbortSignal.any([combined, requestAbort.signal])
        try {
          const headers: Record<string, string> = { Range: `bytes=${start}-${end - 1}` }
          if (etag && !etag.startsWith('W/')) headers['If-Match'] = etag
          const response = await fetcher(url, {
            headers,
            signal: requestSignal,
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
          })
          if (response.status >= 500 && attempt < REMOTE_LIMITS.retries) {
            await response.body?.cancel()
            continue
          }
          if (response.status !== 206) {
            await response.body?.cancel()
            if (response.status === 412)
              throw new RemoteMediaError('changed', '视频内容已变化，请重新打开')
            if (response.status === 200)
              throw new RemoteMediaError('range', '该来源不支持按需读取，请使用其他视频直链')
            throw new RemoteMediaError('access', '视频链接无法访问，请检查地址或更换链接')
          }
          const range = response.headers.get('Content-Range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/)
          const total = Number(range?.[3])
          const type = response.headers.get('Content-Type') ?? ''
          const encoding = response.headers.get('Content-Encoding')
          if (
            !range ||
            Number(range[1]) !== start ||
            Number(range[2]) !== end - 1 ||
            !Number.isSafeInteger(total) ||
            total < end ||
            (encoding && encoding !== 'identity')
          ) {
            await response.body?.cancel()
            throw new RemoteMediaError('range', '视频范围信息无效或无法跨域读取')
          }
          if (/html|mpegurl|dash\+xml/i.test(type)) {
            await response.body?.cancel()
            throw new RemoteMediaError('unsupported', '链接返回网页或播放清单，请使用视频文件直链')
          }
          if (
            size &&
            (size !== total ||
              (etag && response.headers.get('ETag') !== etag) ||
              (!etag && modified && response.headers.get('Last-Modified') !== modified))
          ) {
            await response.body?.cancel()
            throw new RemoteMediaError('changed', '视频内容已变化，请重新打开')
          }
          const reader = response.body?.getReader()
          if (!reader) throw new RemoteMediaError('range', '视频响应为空')
          if (streaming) {
            // 响应头通过验证即可转交，不能等 32 MiB 全部下载完才让 video 看见首字节。
            // 请求额度一直持有到流结束；下游取消、租约撤销和读取停滞都会中断上游。
            handedOff = true
            const stream = validatedRemoteStream(
              reader,
              end - start,
              requestSignal,
              requestAbort,
              release,
            )
            return { bytes: new Uint8Array(), total, response, stream }
          }
          const bytes = new Uint8Array(end - start)
          let offset = 0
          try {
            while (true) {
              clearTimeout(timer)
              timer = setTimeout(() => requestAbort.abort(), REMOTE_LIMITS.timeout)
              const chunk = await reader.read()
              if (chunk.done) break
              if (offset + chunk.value.length > bytes.length)
                throw new RemoteMediaError('range', '视频响应超出请求范围')
              bytes.set(chunk.value, offset)
              offset += chunk.value.length
            }
            if (offset !== bytes.length)
              throw new RemoteMediaError('range', '视频响应不完整，请重试')
          } finally {
            await reader.cancel().catch(() => {})
            reader.releaseLock()
          }
          combined.throwIfAborted()
          return { bytes, total, response }
        } catch (error) {
          combined.throwIfAborted()
          if (error instanceof RemoteMediaError) throw error
          if (attempt >= REMOTE_LIMITS.retries)
            throw new RemoteMediaError(
              'access',
              '视频读取失败，请检查网络、HTTPS 和跨域设置，或更换链接',
            )
        } finally {
          clearTimeout(timer)
        }
      }
    } finally {
      if (!handedOff) release()
    }
  }
  try {
    const probe = await request(0, 1)
    // 后续读取固定本次最终地址，避免重复重定向到不同签名资源。
    url = probe.response.url ? validateRemoteUrl(probe.response.url) : url
    size = probe.total
    etag = probe.response.headers.get('ETag')
    modified = probe.response.headers.get('Last-Modified')
    const name = remoteName(url, probe.response.headers.get('Content-Disposition'))
    const read: RemoteRangeSource['read'] = async (start, end, caller) => {
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        end < start ||
        end > size ||
        end - start > REMOTE_LIMITS.chunk
      )
        throw new RemoteMediaError('range', '视频读取范围无效')
      if (start === end) return new Uint8Array()
      return (await request(start, end, caller)).bytes
    }
    // 只读取少量内容识别被伪装成二进制响应的网页或清单。
    const prefix = new TextDecoder().decode(await read(0, Math.min(size, 512))).trimStart()
    if (/^(?:#EXTM3U|<!doctype\s+html|<html|<\?xml|<MPD)/i.test(prefix))
      throw new RemoteMediaError('unsupported', '链接返回网页或播放清单，请使用视频文件直链')
    const stream: RemoteRangeSource['stream'] = async (start, end, caller) => {
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        end <= start ||
        end > size ||
        end - start > REMOTE_LIMITS.chunk
      )
        throw new RemoteMediaError('range', '视频读取范围无效')
      return (await request(start, end, caller, true)).stream!
    }
    return {
      size,
      name,
      url: probe.response.url || url,
      read,
      stream,
      close: () => controller.abort(),
    }
  } catch (error) {
    controller.abort()
    throw error
  }
}

/** 对连续数据使用停滞超时，而非整段下载期限；保持反压，不在 JS 中累积整个响应。 */
function validatedRemoteStream(
  reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>,
  expected: number,
  signal: AbortSignal,
  requestAbort: AbortController,
  release: () => void,
): ReadableStream<Uint8Array<ArrayBuffer>> {
  let offset = 0
  let finished = false
  let output: ReadableStreamDefaultController<Uint8Array<ArrayBuffer>>
  const finish = () => {
    if (finished) return
    finished = true
    signal.removeEventListener('abort', onAbort)
    void reader.cancel().catch(() => {})
    release()
  }
  const onAbort = () => {
    if (finished) return
    output.error(new RemoteMediaError('access', '视频读取已中断，请重试或更换链接'))
    finish()
  }
  return new ReadableStream(
    {
      start(controller) {
        output = controller
        signal.addEventListener('abort', onAbort, { once: true })
        if (signal.aborted) onAbort()
      },
      async pull(controller) {
        const timer = setTimeout(() => requestAbort.abort(), REMOTE_LIMITS.timeout)
        try {
          const chunk = await reader.read()
          if (finished) return
          if (chunk.done) {
            if (offset !== expected) throw new RemoteMediaError('range', '视频响应不完整，请重试')
            controller.close()
            finish()
            return
          }
          offset += chunk.value.byteLength
          if (offset > expected) throw new RemoteMediaError('range', '视频响应超出请求范围')
          controller.enqueue(chunk.value)
        } catch (error) {
          if (!finished) {
            controller.error(
              error instanceof RemoteMediaError
                ? error
                : new RemoteMediaError('access', '视频读取失败，请重试或更换链接'),
            )
            finish()
          }
        } finally {
          clearTimeout(timer)
        }
      },
      cancel() {
        finish()
        requestAbort.abort()
      },
    },
    { highWaterMark: 0 },
  )
}
