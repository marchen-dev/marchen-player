import type { PlaybackResource } from '../platform/media-resource'
import { describe, expect, it } from 'vitest'
import { detectCompatSupport } from '../compat-support'
import {
  assertNativeVideoSupport,
  canFallbackToCompat,
  choosePlaybackEngine,
} from '../engine-policy'

describe('compat 产品支持范围', () => {
  it('safari/Firefox 即使有解码 API 也不开放，桌面 Chromium/Electron 允许', () => {
    for (const ua of [
      'Version/18.0 Safari/605.1',
      'Firefox/140.0',
      'CriOS/140.0 Safari/605.1',
      'FxiOS/140.0',
    ])
      expect(detectCompatSupport(ua, false, true).supported).toBe(false)
    expect(detectCompatSupport('Chrome/140.0 Safari/537.36', false, true).supported).toBe(true)
    expect(detectCompatSupport('MarchenPlayer/1.0', true, true).supported).toBe(true)
    expect(detectCompatSupport('Chrome/140.0', false, false).supported).toBe(false)
  })
  it('不支持时旧Canvas偏好和自动模式均只走原生，不触发资源探测或降级', async () => {
    const resource = {} as PlaybackResource
    for (const preference of ['auto', 'compat', 'native'] as const)
      expect(await choosePlaybackEngine(preference, resource, () => '', undefined, false)).toBe(
        'native',
      )
    expect(canFallbackToCompat('auto', 'native', false, { code: 'decode' }, false)).toBe(false)
    expect(canFallbackToCompat('auto', 'native', false, { code: 'not-supported' }, false)).toBe(
      false,
    )
  })
})

it('原生播放前独立检查视频轨编码，不因音轨可播放行', async () => {
  const resource = {
    input: {
      getFormat: async () => ({ mimeType: 'video/x-matroska' }),
      getPrimaryVideoTrack: async () => ({
        getDecoderConfig: async () => ({ codec: 'hev1.2.4.L120.90' }),
      }),
    },
  } as unknown as PlaybackResource
  await expect(assertNativeVideoSupport(resource, () => '')).rejects.toThrow('容器或视频编码')
  await expect(
    assertNativeVideoSupport(resource, (mime) => (mime.includes('hev1') ? 'probably' : '')),
  ).resolves.toBeUndefined()
})
