import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MediaGatewayRegistry } from './registry'
import { MediaGatewayRouter } from './router'
import { MediaGatewayServer } from './server'

const temporaryDirectories: string[] = []
afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

const fixture = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'marchen-range-gateway-'))
  temporaryDirectories.push(directory)
  const sourcePath = join(directory, 'video.mp4')
  await writeFile(sourcePath, '0123456789')
  const registry = new MediaGatewayRegistry()
  const session = registry.createSession('hash')
  registry.registerSource(session.id, {
    path: sourcePath,
    mimeType: 'video/mp4',
    cacheControl: 'private, no-store',
    complete: true,
  })
  const router = new MediaGatewayRouter(registry, {
    isOriginAllowed: (origin) => origin === 'app://marchen',
  })
  const server = new MediaGatewayServer(router.handle)
  const baseUrl = await server.start()
  const url = `${baseUrl}/v1/media/${session.token}/source`
  return { server, url }
}

const get = (url: string, range?: string, method = 'GET') =>
  fetch(url, {
    method,
    headers: { Origin: 'app://marchen', ...(range ? { Range: range } : {}) },
  })

describe('media Gateway direct Range', () => {
  it('覆盖完整响应、HEAD、start-end、start-、suffix 与 416', async () => {
    const { server, url } = await fixture()
    try {
      const full = await get(url)
      expect(full.status).toBe(200)
      expect(await full.text()).toBe('0123456789')
      expect(full.headers.get('accept-ranges')).toBe('bytes')

      const head = await get(url, undefined, 'HEAD')
      expect(head.status).toBe(200)
      expect(head.headers.get('content-length')).toBe('10')
      expect(await head.text()).toBe('')

      for (const [range, status, body, contentRange] of [
        ['bytes=2-5', 206, '2345', 'bytes 2-5/10'],
        ['bytes=7-', 206, '789', 'bytes 7-9/10'],
        ['bytes=-3', 206, '789', 'bytes 7-9/10'],
      ] as const) {
        const response = await get(url, range)
        expect(response.status).toBe(status)
        expect(await response.text()).toBe(body)
        expect(response.headers.get('content-range')).toBe(contentRange)
      }

      for (const range of ['bytes=20-', 'bytes=5-2', 'bytes=0-1,3-4', 'items=0-1']) {
        const response = await get(url, range)
        expect(response.status).toBe(416)
        expect(response.headers.get('content-range')).toBe('bytes */10')
      }
    } finally {
      await server.stop()
    }
  })

  it('客户端中断后仍可继续服务请求', async () => {
    const { server, url } = await fixture()
    try {
      await new Promise<void>((resolve, reject) => {
        const request = httpRequest(url, { headers: { Origin: 'app://marchen' } })
        request.once('response', (response) => {
          response.once('data', () => {
            request.destroy()
            resolve()
          })
        })
        request.once('error', (error) => {
          if ((error as NodeJS.ErrnoException).code === 'ECONNRESET') resolve()
          else reject(error)
        })
        request.end()
      })
      await expect(get(url)).resolves.toMatchObject({ status: 200 })
    } finally {
      await server.stop()
    }
  })
})
