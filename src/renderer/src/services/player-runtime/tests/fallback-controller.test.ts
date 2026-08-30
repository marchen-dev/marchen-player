import type { PlaybackError } from '@marchen/playback-core'
import type { PlaybackFallbackState } from '../fallback-controller'
import { describe, expect, it, vi } from 'vitest'
import { isNativeDecodeFallbackError, PlaybackFallbackController } from '../fallback-controller'

const error = (code: PlaybackError['code']): PlaybackError => ({
  code,
  message: code,
  recoverable: false,
})

const state: PlaybackFallbackState = {
  media: { currentTime: 321, volume: 0.6, muted: true, rate: 1.5, paused: false },
  rotation: 90,
  subtitle: { selectedId: 'embedded:2', timeOffset: -1.5 },
  danmaku: { enabled: false },
}

describe('一次性原生解码回退', () => {
  it.each(['decode', 'not-supported'] as const)('%s 可触发回退', (code) => {
    expect(isNativeDecodeFallbackError(error(code))).toBe(true)
  })

  it.each(['source-unavailable', 'network', 'aborted', 'unknown'] as const)(
    '%s 不得误触发转码',
    (code) => {
      expect(isNativeDecodeFallbackError(error(code))).toBe(false)
    },
  )

  it('换源后恢复播放参数、旋转、字幕和弹幕状态', async () => {
    const controller = new PlaybackFallbackController()
    const prepareAndActivate = vi.fn(async () => {})
    const restore = vi.fn(async () => {})

    await expect(
      controller.replace({
        logicalSourceId: 'hash:episode-01',
        mode: 'direct',
        error: error('decode'),
        capture: () => structuredClone(state),
        prepareAndActivate,
        restore,
      }),
    ).resolves.toEqual({ status: 'replaced' })
    expect(prepareAndActivate).toHaveBeenCalledOnce()
    expect(restore).toHaveBeenCalledWith(state)
  })

  it('同一 logical source 最多回退一次，兼容源失败不得再次回退', async () => {
    const controller = new PlaybackFallbackController()
    const request = {
      logicalSourceId: 'hash:episode-01',
      mode: 'direct' as const,
      error: error('not-supported'),
      capture: () => state,
      prepareAndActivate: async () => {},
      restore: () => {},
    }
    await controller.replace(request)
    await expect(controller.replace(request)).resolves.toEqual({
      status: 'ignored',
      reason: 'already-attempted',
    })
    await expect(controller.replace({ ...request, mode: 'transcode-video' })).resolves.toEqual({
      status: 'ignored',
      reason: 'ineligible-mode',
    })
  })

  it.each(['remux', 'transcode-audio'] as const)(
    '%s 的原视频解码失败可升级为视频转码',
    async (mode) => {
      const controller = new PlaybackFallbackController()
      const prepareAndActivate = vi.fn(async () => {})
      await expect(
        controller.replace({
          logicalSourceId: `hash:${mode}`,
          mode,
          error: error('decode'),
          capture: () => state,
          prepareAndActivate,
          restore: () => {},
        }),
      ).resolves.toEqual({ status: 'replaced' })
      expect(prepareAndActivate).toHaveBeenCalledOnce()
    },
  )

  it('准备失败也消耗额度，避免失败循环', async () => {
    const controller = new PlaybackFallbackController()
    const prepareError = new Error('generation failed')
    await expect(
      controller.replace({
        logicalSourceId: 'hash:episode-02',
        mode: 'direct',
        error: error('decode'),
        capture: () => state,
        prepareAndActivate: async () => {
          throw prepareError
        },
        restore: () => {},
      }),
    ).rejects.toBe(prepareError)
    expect(controller.hasAttempted('hash:episode-02')).toBe(true)
  })
})
