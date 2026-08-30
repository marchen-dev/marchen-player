import { describe, expect, it, vi } from 'vitest'
import { prepareElectronDirectLease } from '../platform/electron-direct-lease'

const source = {
  kind: 'electron-file' as const,
  path: '/video.mkv',
  hash: 'hash',
  name: 'video.mkv',
  size: 100,
}

describe('electron direct 传输切换', () => {
  it('默认不调用 Gateway，继续返回 custom-protocol lease', async () => {
    const prepareGateway = vi.fn()
    const lease = await prepareElectronDirectLease(source, {
      gatewayEnabled: false,
      prepareGateway,
      releaseGateway: vi.fn(),
    })
    expect(lease).toMatchObject({ transport: 'custom-protocol', url: 'marchen:///video.mkv' })
    expect(prepareGateway).not.toHaveBeenCalled()
  })

  it('显式开启时使用 Gateway，准备失败则回退 custom-protocol', async () => {
    const releaseGateway = vi.fn()
    const gateway = await prepareElectronDirectLease(source, {
      gatewayEnabled: true,
      prepareGateway: async () => ({
        ok: true,
        data: {
          id: 'session',
          logicalSourceId: 'hash',
          mode: 'direct',
          status: 'ready',
          lease: {
            id: 'lease',
            logicalSourceId: 'hash',
            mode: 'direct',
            transport: 'http-range',
            url: 'http://127.0.0.1:1234/v1/media/token/source',
            sessionId: 'session',
            timeline: { originalDuration: 0, offset: 0, calibrated: false },
          },
        },
      }),
      releaseGateway,
    })
    expect(gateway.transport).toBe('http-range')
    gateway.release()
    expect(releaseGateway).toHaveBeenCalledWith('session')

    const fallback = await prepareElectronDirectLease(source, {
      gatewayEnabled: true,
      prepareGateway: async () => {
        throw new Error('gateway failed')
      },
      releaseGateway,
    })
    expect(fallback.transport).toBe('custom-protocol')
  })
})
