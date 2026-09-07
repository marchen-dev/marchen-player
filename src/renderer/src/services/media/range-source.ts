import type { SubtitleSource } from './subtitles/matroska'

/** URL 来自平台授权租约；不接受服务端忽略 Range 后下载整部影片。 */
export async function openRangeSource(url: string, signal?: AbortSignal): Promise<SubtitleSource> {
  const head = await fetch(url, { method: 'HEAD', signal })
  if (!head.ok) throw new Error(`媒体来源不可用（${head.status}）`)
  const length = head.headers.get('Content-Length')
  const size = length === null ? NaN : Number(length)
  const etag = head.headers.get('ETag')
  if (!Number.isSafeInteger(size) || size < 0 || !etag)
    throw new Error('媒体来源缺少长度或版本信息')
  return {
    size,
    read: async (start, end, readSignal) => {
      const combined =
        signal && readSignal ? AbortSignal.any([signal, readSignal]) : (signal ?? readSignal)
      combined?.throwIfAborted()
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        end < start ||
        end > size
      )
        throw new Error('媒体范围越界')
      if (start === end) return new Uint8Array()
      if (end - start > 32 * 1024 * 1024) throw new Error('单次读取超过预算')
      const response = await fetch(url, {
        headers: { Range: `bytes=${start}-${end - 1}`, 'If-Match': etag },
        signal: combined,
      })
      if (
        response.status !== 206 ||
        response.headers.get('Content-Range') !== `bytes ${start}-${end - 1}/${size}` ||
        response.headers.get('ETag') !== etag
      ) {
        await response.body?.cancel()
        throw new Error(
          response.status === 412 ? '媒体文件已变化，请重新打开' : '媒体 Range 响应无效',
        )
      }
      // 流式限定响应体，防止声明长度正确但实际返回整部文件。
      const reader = response.body?.getReader()
      if (!reader) throw new Error('媒体响应为空')
      const output = new Uint8Array(end - start)
      let offset = 0
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (offset + value.length > output.length) throw new Error('媒体响应超过请求范围')
          output.set(value, offset)
          offset += value.length
        }
        combined?.throwIfAborted()
        if (offset !== output.length) throw new Error('媒体响应短读')
        return output
      } finally {
        await reader.cancel()
        reader.releaseLock()
      }
    },
  }
}
