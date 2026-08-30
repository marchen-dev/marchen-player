import type { PlaybackFallbackState } from '../fallback-controller'
import { describe, expect, it, vi } from 'vitest'
import { capturePlaybackFallbackState, restorePlaybackFallbackState } from '../fallback-state'

const state: PlaybackFallbackState = {
  media: { currentTime: 45, volume: 0.5, muted: false, rate: 1.25, paused: false },
  rotation: 270,
  subtitle: { selectedId: 'history:2', timeOffset: 1.5 },
  danmaku: { enabled: true },
}

describe('兼容换源状态恢复', () => {
  it('从逻辑 clock 与视觉状态生成完整快照', () => {
    const runtime = {
      clock: {
        snapshot: () => ({
          ...state.media,
          duration: 120,
          seeking: false,
          ended: false,
          buffered: [],
        }),
      },
    }
    expect(
      capturePlaybackFallbackState(runtime as never, {
        rotation: state.rotation,
        subtitle: state.subtitle,
        danmaku: state.danmaku,
      }),
    ).toEqual(state)
  })

  it('恢复媒体、旋转、字幕选择/偏移与弹幕开关', async () => {
    const restore = vi.fn()
    const visual = {
      setRotation: vi.fn(),
      selectSubtitle: vi.fn(),
      setSubtitleTimeOffset: vi.fn(),
      setDanmakuEnabled: vi.fn(),
    }
    await restorePlaybackFallbackState({ commands: { restore } } as never, state, visual)
    expect(restore).toHaveBeenCalledWith(state.media)
    expect(visual.setRotation).toHaveBeenCalledWith(270)
    expect(visual.selectSubtitle).toHaveBeenCalledWith('history:2')
    expect(visual.setSubtitleTimeOffset).toHaveBeenCalledWith(1.5)
    expect(visual.setDanmakuEnabled).toHaveBeenCalledWith(true)
  })
})
