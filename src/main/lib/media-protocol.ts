import type { WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { fileRangeResponse } from './file-range-response'
import { fromFilename } from './mime-utils'

const leases = new Map<string, { path: string; owner: number; controller: AbortController }>()
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
export function releaseMediaLeases(owner: number) {
  generations.set(owner, (generations.get(owner) ?? 0) + 1)
  for (const [id, lease] of leases)
    if (lease.owner === owner) {
      lease.controller.abort()
      leases.delete(id)
    }
}
export async function createMediaLease(path: string, owner: WebContents) {
  if (owner.isDestroyed() || !isApplicationUrl(owner.getURL())) throw new Error('媒体请求来源无效')
  if (!['.mp4', '.mkv', '.ass', '.ssa', '.srt', '.vtt'].includes(extname(path).toLowerCase()))
    throw new Error('不支持的媒体文件类型')
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
          response = await fileRangeResponse(
            lease.path,
            new Request(request, {
              signal: AbortSignal.any([request.signal, lease.controller.signal]),
            }),
            fromFilename(lease.path) || 'application/octet-stream',
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
