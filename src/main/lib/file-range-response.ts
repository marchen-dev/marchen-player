import { open } from 'node:fs/promises'
import { Readable } from 'node:stream'

/** 同一文件句柄提供 HEAD/Range，避免 stat 和 open 指向不同文件。 */
export async function fileRangeResponse(filePath: string, request: Request, mime: string) {
  if (!['GET', 'HEAD'].includes(request.method))
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } })
  const file = await open(filePath, 'r')
  let transferred = false
  try {
    const stat = await file.stat()
    if (!stat.isFile()) return new Response(null, { status: 404 })
    const etag = `"${stat.ino}-${stat.size}-${stat.mtimeMs}"`
    const headers = new Headers({ 'Content-Type': mime, 'Accept-Ranges': 'bytes', ETag: etag })
    if (request.headers.has('If-Match') && request.headers.get('If-Match') !== etag)
      return new Response(null, { status: 412, headers })
    let start = 0
    let end = stat.size - 1
    let status = 200
    const range = request.method === 'GET' ? request.headers.get('Range') : null
    const ifRange = request.headers.get('If-Range')
    if (range && (!ifRange || ifRange === etag)) {
      const match = range.match(/^bytes=(\d*)-(\d*)$/)
      if (match && (match[1] || match[2])) {
        if (!match[1]) {
          const suffix = Number(match[2])
          start = Math.max(0, stat.size - suffix)
        } else {
          start = Number(match[1])
          if (match[2]) end = Math.min(end, Number(match[2]))
        }
      } else start = NaN
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= stat.size
      ) {
        headers.set('Content-Range', `bytes */${stat.size}`)
        return new Response(null, { status: 416, headers })
      }
      status = 206
      headers.set('Content-Range', `bytes ${start}-${end}/${stat.size}`)
    }
    headers.set('Content-Length', String(Math.max(0, end - start + 1)))
    if (request.method === 'HEAD' || !stat.size) return new Response(null, { status, headers })
    request.signal.throwIfAborted()
    const stream = file.createReadStream({ start, end, autoClose: true })
    transferred = true
    const abort = () => stream.destroy()
    request.signal.addEventListener('abort', abort, { once: true })
    stream.once('close', () => request.signal.removeEventListener('abort', abort))
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status, headers })
  } finally {
    if (!transferred) await file.close()
  }
}
