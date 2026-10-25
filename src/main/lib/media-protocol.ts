import type { RemoteRangeSource } from '@marchen/shared/media/remote'
import type { WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { isVideoFile } from '@marchen/shared/media'
import { SOURCE_IMAGE_HOST } from '@marchen/shared/media-sources'
import { openRemoteRangeSource, REMOTE_LIMITS } from '@marchen/shared/media/remote'
import { isDownloadedMediaAvailable } from '../services/downloads/availability'
import { fileRangeResponse } from './file-range-response'
import { fromFilename } from './mime-utils'
import { createAuthorizedFetcher, fetchRemoteMedia } from './remote-media'
import { cacheRemotePrefix } from './remote-prefix-cache'
import { RemoteTransferMeter, trackRemoteTransfer } from './remote-transfer'

const leases = new Map<
  string,
  {
    path?: string
    remote?: Promise<RemoteRangeSource>
    owner: number
    controller: AbortController
    meter?: RemoteTransferMeter
    /** 媒体源租约所属来源，用于移除来源时撤销 */
    sourceId?: string
  }
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
  return openRemoteLease(id, owner, (signal) =>
    openRemoteRangeSource(url, signal, fetchRemoteMedia),
  )
}

/** provider 解析出的上游请求；只在主进程内流转，renderer 拿到的只有 marchen://media 地址。 */
export interface ProviderPlaybackTarget {
  url: string
  headers: Record<string, string>
  /** 鉴权头只发往这个 origin */
  origin: string
  /** Jellyfin 的 /stream 路径推不出真实文件名，弹幕匹配需要 provider 给出的文件名 */
  name: string
  sourceId: string
}

export async function createProviderMediaLease(
  target: ProviderPlaybackTarget,
  id: string,
  owner: WebContents,
) {
  const fetcher = createAuthorizedFetcher(target.headers, target.origin)
  return openRemoteLease(
    id,
    owner,
    async (signal) => ({
      ...(await openRemoteRangeSource(target.url, signal, fetcher)),
      name: target.name,
    }),
    target.sourceId,
  )
}

async function openRemoteLease(
  id: string,
  owner: WebContents,
  open: (signal: AbortSignal) => Promise<RemoteRangeSource>,
  sourceId?: string,
) {
  if (owner.isDestroyed() || !isApplicationUrl(owner.getURL())) throw new Error('媒体请求来源无效')
  if (!/^[a-z0-9-]{36}$/i.test(id) || leases.has(id)) throw new Error('媒体租约无效')
  if ([...leases.values()].filter((lease) => lease.owner === owner.id).length >= 32)
    throw new Error('媒体租约超过限制')
  registerOwner(owner)
  const controller = new AbortController()
  const meter = new RemoteTransferMeter()
  const remote = open(controller.signal).then((source) => {
    controller.signal.throwIfAborted()
    return cacheRemotePrefix(trackRemoteTransfer(source, meter), controller.signal)
  })
  leases.set(id, { owner: owner.id, controller, remote, meter, sourceId })
  try {
    const source = await remote
    controller.signal.throwIfAborted()
    return { id, url: `marchen://media/${id}`, size: source.size, name: source.name }
  } catch (error) {
    leases.delete(id)
    controller.abort()
    // 媒体源需要区分「不支持范围读取」「登录失效」等，由调用方映射错误码
    if (sourceId) throw error
    throw new Error('视频链接无法访问或不支持按需读取')
  }
}

/** 移除来源或重置应用时撤销该来源的全部租约，正在进行的读取随之中止。 */
export function releaseSourceMediaLeases(sourceId?: string) {
  for (const [id, lease] of leases)
    if (lease.sourceId && (sourceId === undefined || lease.sourceId === sourceId)) {
      lease.controller.abort()
      leases.delete(id)
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
  if (!(await isDownloadedMediaAvailable(path))) throw new Error('文件尚未下载完成')
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

/** 海报代理由媒体源服务注册，协议层不直接依赖 services，避免循环引用。 */
let sourceImageHandler: ((url: URL) => Promise<Response>) | undefined
export function setSourceImageHandler(handler: (url: URL) => Promise<Response>) {
  sourceImageHandler = handler
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
      } else if (url.host === SOURCE_IMAGE_HOST && sourceImageHandler) {
        // 只服务应用页面里的 <img>，不允许被当作文档打开或被其他来源读取
        if (request.destination !== 'image' && request.destination !== '')
          return new Response(null, { status: 403 })
        const origin = request.headers.get('Origin')
        if (origin && !isApplicationUrl(origin)) return new Response(null, { status: 403 })
        if (request.method !== 'GET') return new Response(null, { status: 405 })
        response = await sourceImageHandler(url)
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

/** 仅读取当前窗口所属租约，不返回 URL、路径等来源信息。 */
export function getRemoteTransfer(id: string, owner: number) {
  const lease = leases.get(id)
  return lease?.owner === owner ? (lease.meter?.snapshot() ?? null) : null
}
