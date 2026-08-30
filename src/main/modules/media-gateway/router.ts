import type { IncomingMessage, ServerResponse } from 'node:http'
import type { MediaGatewayRegistry } from './registry'
import { createReadStream } from 'node:fs'
import { lstat } from 'node:fs/promises'

const ROUTE = /^\/v1\/media\/([\w-]{43})\/g\/(\d+)\/([A-Za-z0-9][\w.-]{0,127})$/
const SOURCE_ROUTE = /^\/v1\/media\/([\w-]{43})\/source$/
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

export interface MediaGatewayRouterOptions {
  isOriginAllowed: (origin: string) => boolean
}

export class MediaGatewayRouter {
  constructor(
    private readonly registry: MediaGatewayRegistry,
    private readonly options: MediaGatewayRouterOptions,
  ) {}

  handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (!request.socket.remoteAddress || !LOOPBACK_ADDRESSES.has(request.socket.remoteAddress)) {
      return this.respond(response, 403)
    }
    const host = request.headers.host ?? ''
    if (!/^127\.0\.0\.1:\d+$/.test(host)) return this.respond(response, 403)
    const origin = request.headers.origin
    if (!origin || !this.options.isOriginAllowed(origin)) return this.respond(response, 403)

    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Vary', 'Origin')
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
      response.setHeader('Access-Control-Allow-Headers', 'Range')
      return this.respond(response, 204)
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD, OPTIONS')
      return this.respond(response, 405)
    }

    const rawPath = (request.url ?? '').split('?', 1)[0]!
    if (/%(?:2e|2f|5c)/i.test(rawPath)) return this.respond(response, 400)
    const sourceMatch = rawPath.match(SOURCE_ROUTE)
    if (sourceMatch) {
      const source = this.registry.resolveSource(sourceMatch[1]!)
      if (!source?.complete) return this.respond(response, 404)
      await this.serveResource(request, response, source, true)
      return
    }
    const match = rawPath.match(ROUTE)
    if (!match) return this.respond(response, 404)
    const generation = Number(match[2])
    if (!Number.isSafeInteger(generation)) return this.respond(response, 404)
    const resource = this.registry.resolve(match[1]!, generation, match[3]!)
    if (!resource?.complete) return this.respond(response, 404)
    await this.serveResource(request, response, resource, false)
  }

  private async serveResource(
    request: IncomingMessage,
    response: ServerResponse,
    resource: { path: string; mimeType: string; cacheControl: string },
    allowRange: boolean,
  ): Promise<void> {
    let statistics
    try {
      statistics = await lstat(resource.path)
    } catch {
      return this.respond(response, 404)
    }
    if (!statistics.isFile() || statistics.isSymbolicLink()) return this.respond(response, 404)

    let start = 0
    let end = Math.max(0, statistics.size - 1)
    if (allowRange) response.setHeader('Accept-Ranges', 'bytes')
    const range = allowRange ? parseRange(request.headers.range, statistics.size) : undefined
    if (range === null) {
      response.setHeader('Content-Range', `bytes */${statistics.size}`)
      return this.respond(response, 416)
    }
    if (range) {
      start = range.start
      end = range.end
      response.statusCode = 206
      response.setHeader('Content-Range', `bytes ${start}-${end}/${statistics.size}`)
    } else {
      response.statusCode = 200
    }
    response.setHeader('Content-Type', resource.mimeType)
    response.setHeader('Cache-Control', resource.cacheControl)
    response.setHeader('Content-Length', statistics.size === 0 ? 0 : end - start + 1)
    if (request.method === 'HEAD') {
      response.end()
      return
    }

    const stream = createReadStream(
      resource.path,
      statistics.size === 0 ? undefined : { start, end },
    )
    request.once('aborted', () => stream.destroy())
    response.once('close', () => {
      if (!response.writableFinished) stream.destroy()
    })
    stream.once('error', () => response.destroy())
    stream.pipe(response)
  }

  private respond(response: ServerResponse, status: number): void {
    response.statusCode = status
    response.end()
  }
}

const parseRange = (
  header: string | undefined,
  size: number,
): { start: number; end: number } | null | undefined => {
  if (!header) return undefined
  if (size <= 0 || header.includes(',')) return null
  const match = header.match(/^bytes=(\d*)-(\d*)$/)
  if (!match || (!match[1] && !match[2])) return null
  if (!match[1]) {
    const suffixLength = Number(match[2])
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null
    return { start: Math.max(0, size - suffixLength), end: size - 1 }
  }
  const start = Number(match[1])
  const requestedEnd = match[2] ? Number(match[2]) : size - 1
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= size ||
    requestedEnd < start
  ) {
    return null
  }
  return { start, end: Math.min(requestedEnd, size - 1) }
}
