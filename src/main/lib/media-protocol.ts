import type { RemoteRangeSource } from '@marchen/shared/media/remote'
import type { WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { isVideoFile } from '@marchen/shared/media'
import { openRemoteRangeSource, REMOTE_LIMITS } from '@marchen/shared/media/remote'
import { isDownloadedMediaAvailable } from '../services/downloads/availability'
import { fileRangeResponse } from './file-range-response'
import { fromFilename } from './mime-utils'
import { fetchRemoteMedia } from './remote-media'
import { cacheRemotePrefix } from './remote-prefix-cache'

const leases = new Map<
  string,
  { path?: string; remote?: Promise<RemoteRangeSource>; owner: number; controller: AbortController }
>()
const generations = new Map<number, number>()
const owners = new Set<number>()
const devOrigin = process.env.ELECTRON_RENDERER_URL
  ? new URL(process.env.ELECTRON_RENDERER_URL).origin
  : null
export const isApplicationUrl = (value: string) => {
  try {
    const url = new URL(value)
    return (
      (url.protocol === 'marchen:' && url.host === 'app') ||
      (devOrigin !== null && url.origin === devOrigin)
    )
  } catch {
    return false
  }
}
/** 请求 id 由调用者持有，IPC 尚未完成时也可取消探测。 */
export async function createRemoteMediaLease(url: string, id: string, owner: WebContents) {
  if (owner.isDestroyed() || !isApplicationUrl(owner.getURL())) throw new Error('媒体请求来源无效')
  if (!/^[a-z0-9-]{36}$/i.test(id) || leases.has(id)) throw new Error('媒体租约无效')
  if ([...leases.values()].filter((lease) => lease.owner === owner.id).length >= 32)
    throw new Error('媒体租约超过限制')
  registerOwner(owner)
  const controller = new AbortController()
  const remote = openRemoteRangeSource(url, controller.signal, fetchRemoteMedia).then((source) => {
    controller.signal.throwIfAborted()
    return cacheRemotePrefix(source, controller.signal)
  })
  leases.set(id, { owner: owner.id, controller, remote })
  try {
    const source = await remote
    controller.signal.throwIfAborted()
    return { id, url: `marchen://media/${id}`, size: source.size, name: source.name }
  } catch {
    leases.delete(id)
    controller.abort()
    throw new Error('视频链接无法访问或不支持按需读取')
  }
}

async function remoteResponse(source: RemoteRangeSource, id: string, request: Request) {
  const headers = {
    'Content-Type': fromFilename(source.name) || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    ETag: `"${id}"`,
  }
  if (request.method === 'HEAD')
    return new Response(null, { headers: { ...headers, 'Content-Length': String(source.size) } })
  if (request.method !== 'GET') return new Response(null, { status: 405 })
  if (request.headers.has('If-Match') && request.headers.get('If-Match') !== headers.ETag)
    return new Response(null, { status: 412, headers })
  let start = 0
  let end = source.size
  let status = 200
  const requested = request.headers.get('Range')
  const ifRange = request.headers.get('If-Range')
  if (requested && (!ifRange || ifRange === headers.ETag)) {
    const range = requested.match(/^bytes=(\d*)-(\d*)$/)
    if (!range || (!range[1] && !range[2])) start = NaN
    else if (!range[1]) start = Math.max(0, source.size - Number(range[2]))
    else {
      start = Number(range[1])
      if (range[2]) end = Math.min(source.size, Number(range[2]) + 1)
    }
    status = 206
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= end)
    return new Response(null, {
      status: 416,
      headers: { ...headers, 'Content-Range': `bytes */${source.size}` },
    })
  const controller = new AbortController()
  const signal = AbortSignal.any([request.signal, controller.signal])
  let offset = start
  let reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | undefined
  const openNext = async () => {
    signal.throwIfAborted()
    const next = Math.min(end, offset + REMOTE_LIMITS.chunk)
    reader = (await source.stream(offset, next, signal)).getReader()
    offset = next
  }
  await openNext()
  // 上游每次最多读取 32 MiB，但对 video 必须描述完整请求范围。
  // 把内部窗口当成响应终点会让 Chromium 将窗口结束误认为媒体 EOF，导致远端 seek 假成功。
  const stream = new ReadableStream<Uint8Array<ArrayBuffer>>(
    {
      async pull(output) {
        try {
          while (true) {
            signal.throwIfAborted()
            const chunk = await reader!.read()
            if (!chunk.done) {
              output.enqueue(chunk.value)
              return
            }
            reader!.releaseLock()
            reader = undefined
            if (offset === end) {
              output.close()
              return
            }
            await openNext()
          }
        } catch (error) {
          controller.abort()
          output.error(error)
        }
      },
      async cancel() {
        controller.abort()
        await reader?.cancel().catch(() => {})
      },
    },
    { highWaterMark: 0 },
  )
  return new Response(stream, {
    status,
    headers: {
      ...headers,
      'Content-Length': String(end - start),
      ...(status === 206 ? { 'Content-Range': `bytes ${start}-${end - 1}/${source.size}` } : {}),
    },
  })
}

export function releaseMediaLeases(owner: number) {
  generations.set(owner, (generations.get(owner) ?? 0) + 1)
  for (const [id, lease] of leases)
    if (lease.owner === owner) {
      lease.controller.abort()
      leases.delete(id)
    }
}
function registerOwner(owner: WebContents) {
  if (!owners.has(owner.id)) {
    owners.add(owner.id)
    owner.once('destroyed', () => {
      releaseMediaLeases(owner.id)
      owners.delete(owner.id)
    })
    owner.on('render-process-gone', () => releaseMediaLeases(owner.id))
    owner.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) releaseMediaLeases(owner.id)
    })
  }
}
export async function createMediaLease(path: string, owner: WebContents) {
  if (owner.isDestroyed() || !isApplicationUrl(owner.getURL())) throw new Error('媒体请求来源无效')
  if (!isVideoFile(path) && !['.ass', '.ssa', '.srt', '.vtt'].includes(extname(path).toLowerCase()))
    throw new Error('不支持的媒体文件类型')
  if (!(await isDownloadedMediaAvailable(path)))
    throw new Error('文件尚未下载完成')
  registerOwner(owner)
  const generation = generations.get(owner.id) ?? 0
  let canonical: string
  try {
    canonical = await realpath(path)
    if (!(await stat(canonical)).isFile()) throw new Error('媒体来源不是文件')
  } catch {
    throw new Error('无法读取本地媒体，请检查文件和访问权限')
  }
  if (owner.isDestroyed()) throw new Error('媒体窗口已关闭')
  if ([...leases.values()].filter((lease) => lease.owner === owner.id).length >= 32)
    throw new Error('媒体租约超过限制')
  if ((generations.get(owner.id) ?? 0) !== generation || !isApplicationUrl(owner.getURL()))
    throw new Error('媒体请求所属页面已变化')
  const id = randomUUID()
  leases.set(id, { path: canonical, owner: owner.id, controller: new AbortController() })
  return { id, url: `marchen://media/${id}` }
}
export function releaseMediaLease(id: string, owner: number) {
  const lease = leases.get(id)
  if (lease?.owner === owner) {
    lease.controller.abort()
    leases.delete(id)
  }
}

export function createApplicationProtocol(rendererRoot: string) {
  return async (request: Request) => {
    try {
      const url = new URL(request.url)
      let response: Response
      if (url.host === 'app') {
        const root = await realpath(rendererRoot)
        const path = await realpath(resolve(root, `.${decodeURIComponent(url.pathname)}`))
        if (!path.startsWith(root + sep)) return new Response(null, { status: 403 })
        response = await fileRangeResponse(
          path,
          request,
          (extname(path) === '.mjs'
            ? 'text/javascript'
            : extname(path) === '.wasm'
              ? 'application/wasm'
              : fromFilename(path)) || 'application/octet-stream',
        )
        response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
        response.headers.set('Cross-Origin-Embedder-Policy', 'credentialless')
      } else if (url.host === 'media') {
        if (request.destination === 'document') return new Response(null, { status: 403 })
        const origin = request.headers.get('Origin')
        if (origin && !isApplicationUrl(origin)) return new Response(null, { status: 403 })
        const lease = leases.get(url.pathname.slice(1))
        if (!lease) return new Response(null, { status: 404 })
        if (request.method === 'OPTIONS') {
          response = new Response(null, {
            status: 204,
            headers: {
              'Access-Control-Allow-Methods': 'GET, HEAD',
              'Access-Control-Allow-Headers': 'Range, If-Match, If-Range',
            },
          })
        } else
          response = lease.remote
            ? await remoteResponse(
                await lease.remote,
                url.pathname.slice(1),
                new Request(request, {
                  signal: AbortSignal.any([request.signal, lease.controller.signal]),
                }),
              )
            : await fileRangeResponse(
                lease.path!,
                new Request(request, {
                  signal: AbortSignal.any([request.signal, lease.controller.signal]),
                }),
                fromFilename(lease.path!) || 'application/octet-stream',
              )
        if (origin) response.headers.set('Access-Control-Allow-Origin', origin)
        response.headers.set(
          'Access-Control-Expose-Headers',
          'Content-Length, Content-Range, ETag, Accept-Ranges',
        )
        response.headers.set('Vary', 'Origin')
        response.headers.set('Cache-Control', 'no-store')
      } else return new Response(null, { status: 404 })
      response.headers.set('Cross-Origin-Resource-Policy', 'cross-origin')
      response.headers.set('X-Content-Type-Options', 'nosniff')
      return response
    } catch {
      return new Response(null, { status: 404 })
    }
  }
}

/** 下载文件删除前检查所有媒体租约，包括已暂停的播放。 */
export const isMediaPathInUse = (path: string) =>
  [...leases.values()].some((lease) => lease.path === path)
