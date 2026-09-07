import type { PlaybackFallbackState } from '../fallback-state'
import { describe, expect, it, vi } from 'vitest'
import {
  capturePlaybackFallbackState,
  PlaybackVisualStateBridge,
  restorePlaybackFallbackState,
} from '../fallback-state'

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

  it('provider bridge 保留真实视觉状态并调用各自恢复端口', async () => {
    const bridge = new PlaybackVisualStateBridge()
    const setRotation = vi.fn()
    const selectSubtitle = vi.fn()
    const setSubtitleTimeOffset = vi.fn()
    const setDanmakuEnabled = vi.fn()
    bridge.bindRotation(270, setRotation)
    bridge.bindSubtitle({
      selectedId: 'history:2',
      timeOffset: 1.5,
      selectSubtitle,
      setSubtitleTimeOffset,
    })
    bridge.bindDanmaku(true, setDanmakuEnabled)
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
      commands: { restore: vi.fn() },
    }
    const captured = bridge.capture(runtime as never)
    expect(captured).toEqual(state)
    await bridge.restore(runtime as never, captured)
    expect(runtime.commands.restore).toHaveBeenCalledWith(state.media)
    expect(setRotation).toHaveBeenCalledWith(270)
    expect(selectSubtitle).toHaveBeenCalledWith('history:2')
    expect(setSubtitleTimeOffset).toHaveBeenCalledWith(1.5)
    expect(setDanmakuEnabled).toHaveBeenCalledWith(true)
  })
})
