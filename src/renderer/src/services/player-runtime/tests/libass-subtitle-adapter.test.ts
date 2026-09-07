import type { PlaybackClock } from '@marchen/playback-core'
import type { LibassInstance } from '../subtitles/libass-subtitle-adapter'
import { describe, expect, it, vi } from 'vitest'
import { LibassSubtitleAdapter } from '../subtitles/libass-subtitle-adapter'

const createFakeInstance = (): LibassInstance => ({
  timeOffset: 0,
  setTrackByUrl: vi.fn(),
  freeTrack: vi.fn(),
  resize: vi.fn(),
  setCurrentTime: vi.fn(),
  setIsPaused: vi.fn(),
  setRate: vi.fn(),
  dispose: vi.fn(),
})

const snapshot = {
  currentTime: 10,
  duration: 60,
  volume: 1,
  muted: false,
  rate: 1,
  paused: true,
  seeking: false,
  ended: false,
  buffered: [],
}
const clock: PlaybackClock = { now: () => snapshot.currentTime, snapshot: () => snapshot }
const canvas = { width: 1920, height: 1080 } as HTMLCanvasElement

describe('libassSubtitleAdapter', () => {
  it('创建、换轨、偏移、关闭、resize 和 dispose 均委托给单一实例', () => {
    const instance = createFakeInstance()
    const createInstance = vi.fn(() => instance)
    const firstRelease = vi.fn()
    const secondRelease = vi.fn()
    const adapter = new LibassSubtitleAdapter(canvas, clock, vi.fn(), createInstance)

    adapter.setTimeOffset(1.5)
    adapter.setTrack('first.ass', firstRelease)
    adapter.setTrack('second.ass', secondRelease)
    adapter.setTimeOffset(-2)
    adapter.resize()
    adapter.close()
    adapter.dispose()

    expect(createInstance).toHaveBeenCalledWith(
      expect.objectContaining({ subUrl: 'first.ass', canvas, timeOffset: 0 }),
    )
    expect(instance.freeTrack).toHaveBeenCalledTimes(2)
    expect(instance.setTrackByUrl).toHaveBeenCalledWith('second.ass')
    expect(instance.setCurrentTime).toHaveBeenLastCalledWith(8)
    expect(instance.setIsPaused).toHaveBeenLastCalledWith(true, 8)
    expect(instance.resize).toHaveBeenCalledOnce()
    expect(instance.dispose).toHaveBeenCalledOnce()
    expect(firstRelease).toHaveBeenCalledOnce()
    expect(secondRelease).toHaveBeenCalledOnce()
  })

  it('共用时钟驱动暂停、倍速和倒退 seek，偏移只应用一次', () => {
    const state = { ...snapshot }
    const instance = createFakeInstance()
    const adapter = new LibassSubtitleAdapter(
      canvas,
      { now: () => state.currentTime, snapshot: () => state },
      vi.fn(),
      () => instance,
    )
    adapter.setTrack('clock.ass')
    adapter.setTimeOffset(1)
    state.paused = false
    state.rate = 1.5
    state.currentTime = 12
    adapter.sync()
    expect(instance.setCurrentTime).toHaveBeenLastCalledWith(13)
    expect(instance.setRate).toHaveBeenLastCalledWith(1.5)
    state.seeking = true
    state.currentTime = 3
    adapter.sync()
    expect(instance.setIsPaused).toHaveBeenLastCalledWith(true, 4)
    expect(instance.setCurrentTime).toHaveBeenLastCalledWith(4)
    adapter.dispose()
  })

  it('销毁后拒绝新轨并立即释放其资源', () => {
    const release = vi.fn()
    const createInstance = vi.fn(() => createFakeInstance())
    const adapter = new LibassSubtitleAdapter(canvas, clock, vi.fn(), createInstance)
    adapter.dispose()

    adapter.setTrack('late.ass', release)

    expect(createInstance).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledOnce()
  })
})
