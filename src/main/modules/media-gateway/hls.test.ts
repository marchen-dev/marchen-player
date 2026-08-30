import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { publishGatewayResource } from './publisher'
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
  const directory = await mkdtemp(join(tmpdir(), 'marchen-hls-gateway-'))
  temporaryDirectories.push(directory)
  const registry = new MediaGatewayRegistry()
  const session = registry.createSession('source')
  const router = new MediaGatewayRouter(registry, {
    isOriginAllowed: (origin) => origin === 'app://marchen',
  })
  const server = new MediaGatewayServer(router.handle)
  const url = await server.start()
  return { directory, registry, session, server, url }
}

describe('media Gateway HLS 原子发布', () => {
  it('只服务已原子发布的完整资源，并支持 HEAD/MIME/缓存策略', async () => {
    const { directory, registry, session, server, url } = await fixture()
    const temporaryPath = join(directory, 'segment-00001.m4s.tmp')
    const finalPath = join(directory, 'segment-00001.m4s')
    await writeFile(temporaryPath, 'complete-segment')
    await publishGatewayResource(registry, {
      sessionId: session.id,
      token: session.token,
      generation: 1,
      name: 'segment-00001.m4s',
      temporaryPath,
      finalPath,
      mimeType: 'video/iso.segment',
      cacheControl: 'private, max-age=31536000, immutable',
    })
    try {
      const resourceUrl = `${url}/v1/media/${session.token}/g/1/segment-00001.m4s`
      const response = await fetch(resourceUrl, { headers: { Origin: 'app://marchen' } })
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('video/iso.segment')
      expect(response.headers.get('cache-control')).toContain('immutable')
      expect(await response.text()).toBe('complete-segment')
      const head = await fetch(resourceUrl, {
        method: 'HEAD',
        headers: { Origin: 'app://marchen' },
      })
      expect(head.status).toBe(200)
      expect(await head.text()).toBe('')
    } finally {
      await server.stop()
    }
  })

  it('清单引用未完成资源时拒绝发布', async () => {
    const { directory, registry, session, server } = await fixture()
    const temporaryPath = join(directory, 'index.m3u8.tmp')
    await writeFile(temporaryPath, '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\nsegment-00001.m4s\n')
    await expect(
      publishGatewayResource(registry, {
        sessionId: session.id,
        token: session.token,
        generation: 1,
        name: 'index.m3u8',
        temporaryPath,
        finalPath: join(directory, 'index.m3u8'),
        mimeType: 'application/vnd.apple.mpegurl',
        cacheControl: 'no-store',
      }),
    ).rejects.toThrow('尚未发布')
    await server.stop()
  })
})
