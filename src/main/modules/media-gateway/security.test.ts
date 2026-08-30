import { describe, expect, it } from 'vitest'
import { MediaGatewayRegistry } from './registry'
import { MediaGatewayRouter } from './router'
import { MediaGatewayServer } from './server'

const startGateway = async () => {
  const registry = new MediaGatewayRegistry()
  const router = new MediaGatewayRouter(registry, {
    isOriginAllowed: (origin) => origin === 'app://marchen',
  })
  const server = new MediaGatewayServer(router.handle)
  const url = await server.start()
  return { registry, server, url }
}

describe('media Gateway 安全边界', () => {
  it('生成不可猜测 token，且资源不能跨会话读取', async () => {
    const registry = new MediaGatewayRegistry()
    const first = registry.createSession('first')
    const second = registry.createSession('second')
    expect(first.token).toMatch(/^[\w-]{43}$/)
    expect(first.token).not.toBe(second.token)
    registry.registerResource(first.id, 1, 'index.m3u8', {
      path: '/private/first/index.m3u8',
      mimeType: 'application/vnd.apple.mpegurl',
      cacheControl: 'no-store',
      complete: true,
    })
    expect(registry.resolve(first.token, 1, 'index.m3u8')).toBeDefined()
    expect(registry.resolve(second.token, 1, 'index.m3u8')).toBeUndefined()
    expect(() =>
      registry.registerResource(first.id, 1, '../secret', {
        path: '/secret',
        mimeType: 'text/plain',
        cacheControl: 'no-store',
        complete: true,
      }),
    ).toThrow('资源标识无效')
  })

  it('拒绝未知 Origin、缺失 Origin、目录穿越和未知 token', async () => {
    const { registry, server, url } = await startGateway()
    const session = registry.createSession('source')
    registry.registerResource(session.id, 1, 'index.m3u8', {
      path: '/private/index.m3u8',
      mimeType: 'application/vnd.apple.mpegurl',
      cacheControl: 'no-store',
      complete: true,
    })
    const allowed = { Origin: 'app://marchen' }
    try {
      expect((await fetch(`${url}/v1/media/${session.token}/g/1/index.m3u8`)).status).toBe(403)
      expect(
        (
          await fetch(`${url}/v1/media/${session.token}/g/1/index.m3u8`, {
            headers: { Origin: 'https://evil.example' },
          })
        ).status,
      ).toBe(403)
      expect(
        (
          await fetch(`${url}/v1/media/${session.token}/g/1/%2e%2e%2fsecret`, {
            headers: allowed,
          })
        ).status,
      ).toBe(400)
      expect(
        (
          await fetch(`${url}/v1/media/${'x'.repeat(43)}/g/1/index.m3u8`, {
            headers: allowed,
          })
        ).status,
      ).toBe(404)
      const registered = await fetch(`${url}/v1/media/${session.token}/g/1/index.m3u8`, {
        headers: allowed,
      })
      expect(registered.status).toBe(404)
      expect(registered.headers.get('access-control-allow-origin')).toBe('app://marchen')
    } finally {
      await server.stop()
    }
  })
})
