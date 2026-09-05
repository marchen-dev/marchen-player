import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MediaGatewayRegistry } from './registry'
import { MediaGatewayRouter } from './router'
import { MediaGatewayServer } from './server'
import { createDynamicHlsManifest } from './dynamic-hls-manifest'
import { createClosedGopTimeline } from './hls-timeline'

const temporaryDirectories: string[] = []
const servers: MediaGatewayServer[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()))
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

const setup = async (enabled: boolean) => {
  const root = await mkdtemp(join(tmpdir(), 'marchen-hls-v2-route-'))
  temporaryDirectories.push(root)
  const registry = new MediaGatewayRegistry()
  const session = registry.createSession('source')
  const router = new MediaGatewayRouter(registry, {
    isOriginAllowed: (origin) => origin === 'http://renderer.local',
    dynamicHlsV2Enabled: enabled,
  })
  const server = new MediaGatewayServer(router.handle)
  servers.push(server)
  return { root, registry, session, url: await server.start() }
}

const register = async (
  root: string,
  registry: MediaGatewayRegistry,
  sessionId: string,
  name: string,
  content: string,
) => {
  const path = join(root, name)
  await writeFile(path, content)
  registry.registerStableResource(sessionId, name, {
    path,
    mimeType: name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/iso.segment',
    cacheControl: name.endsWith('.m3u8') ? 'private, no-cache' : 'private, max-age=31536000',
    complete: true,
  })
}

describe('Dynamic HLS v2 稳定路由', () => {
  it('启用后稳定提供 manifest/init/segment，同时不影响 v1', async () => {
    const { root, registry, session, url } = await setup(true)
    const manifest = createDynamicHlsManifest(
      createClosedGopTimeline({ sourceStartTime: 0, duration: 4, targetSegmentDuration: 2 }),
    )
    await register(root, registry, session.id, 'index.m3u8', manifest)
    await register(root, registry, session.id, 'init.mp4', 'init')
    await register(root, registry, session.id, 'segment-7.m4s', 'segment')
    const headers = { Origin: 'http://renderer.local' }
    const manifestResponse = await fetch(`${url}/v2/media/${session.token}/index.m3u8`, {
      headers,
    })
    expect(manifestResponse.headers.get('content-type')).toContain('application/vnd.apple.mpegurl')
    expect(manifestResponse.headers.get('cache-control')).toBe('private, no-cache')
    expect(await manifestResponse.text()).toBe(manifest)
    await expect(
      fetch(`${url}/v2/media/${session.token}/init.mp4`, { headers }).then((response) =>
        response.text(),
      ),
    ).resolves.toBe('init')
    const segmentResponse = await fetch(`${url}/v2/media/${session.token}/segments/7.m4s`, {
      headers,
    })
    expect(segmentResponse.headers.get('cache-control')).toBe('private, max-age=31536000')
    expect(await segmentResponse.text()).toBe('segment')

    const v1Path = join(root, 'v1.m4s')
    await writeFile(v1Path, 'v1')
    registry.registerResource(session.id, 2, 'segment.m4s', {
      path: v1Path,
      mimeType: 'video/iso.segment',
      cacheControl: 'private',
      complete: true,
    })
    expect(
      await fetch(`${url}/v1/media/${session.token}/g/2/segment.m4s`, { headers }).then(
        (response) => response.text(),
      ),
    ).toBe('v1')
  })

  it('feature flag 关闭时 v2 返回 404，未知 token 也不可读取', async () => {
    const { root, registry, session, url } = await setup(false)
    await register(root, registry, session.id, 'index.m3u8', '#EXTM3U')
    const headers = { Origin: 'http://renderer.local' }
    expect((await fetch(`${url}/v2/media/${session.token}/index.m3u8`, { headers })).status).toBe(
      404,
    )

    const enabled = await setup(true)
    expect(
      (
        await fetch(`${enabled.url}/v2/media/${'x'.repeat(43)}/index.m3u8`, {
          headers,
        })
      ).status,
    ).toBe(404)
  })

  it('v2 拒绝跨 session、目录穿越、半成品与符号链接', async () => {
    const { root, registry, session, url } = await setup(true)
    const other = registry.createSession('other-source')
    await register(root, registry, session.id, 'segment-0.m4s', 'private-segment')
    const incompletePath = join(root, 'incomplete.m4s')
    await writeFile(incompletePath, 'partial')
    registry.registerStableResource(session.id, 'segment-1.m4s', {
      path: incompletePath,
      mimeType: 'video/iso.segment',
      cacheControl: 'private',
      complete: false,
    })
    const symlinkPath = join(root, 'linked.m4s')
    await symlink(join(root, 'segment-0.m4s'), symlinkPath)
    registry.registerStableResource(session.id, 'segment-2.m4s', {
      path: symlinkPath,
      mimeType: 'video/iso.segment',
      cacheControl: 'private',
      complete: true,
    })
    const headers = { Origin: 'http://renderer.local' }

    expect((await fetch(`${url}/v2/media/${other.token}/segments/0.m4s`, { headers })).status).toBe(
      404,
    )
    expect(
      (await fetch(`${url}/v2/media/${session.token}/segments/%2e%2e%2f0.m4s`, { headers })).status,
    ).toBe(400)
    expect(
      (await fetch(`${url}/v2/media/${session.token}/segments/1.m4s`, { headers })).status,
    ).toBe(404)
    expect(
      (await fetch(`${url}/v2/media/${session.token}/segments/2.m4s`, { headers })).status,
    ).toBe(404)
  })
})
