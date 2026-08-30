import type { LibassInstance } from '../subtitles/libass-subtitle-adapter'
import { describe, expect, it, vi } from 'vitest'
import { LibassSubtitleAdapter } from '../subtitles/libass-subtitle-adapter'

const createFakeInstance = (): LibassInstance => ({
  timeOffset: 0,
  setTrackByUrl: vi.fn(),
  freeTrack: vi.fn(),
  resize: vi.fn(),
  dispose: vi.fn(),
})

describe('libassSubtitleAdapter', () => {
  it('创建、换轨、偏移、关闭、resize 和 dispose 均委托给单一实例', () => {
    const instance = createFakeInstance()
    const createInstance = vi.fn(() => instance)
    const firstRelease = vi.fn()
    const secondRelease = vi.fn()
    const adapter = new LibassSubtitleAdapter({} as HTMLVideoElement, vi.fn(), createInstance)

    adapter.setTimeOffset(1.5)
    adapter.setTrack('first.ass', firstRelease)
    adapter.setTrack('second.ass', secondRelease)
    adapter.setTimeOffset(-2)
    adapter.resize()
    adapter.close()
    adapter.dispose()

    expect(createInstance).toHaveBeenCalledWith(
      expect.objectContaining({ subUrl: 'first.ass', timeOffset: 1.5 }),
    )
    expect(instance.freeTrack).toHaveBeenCalledTimes(2)
    expect(instance.setTrackByUrl).toHaveBeenCalledWith('second.ass')
    expect(instance.timeOffset).toBe(-2)
    expect(instance.resize).toHaveBeenCalledOnce()
    expect(instance.dispose).toHaveBeenCalledOnce()
    expect(firstRelease).toHaveBeenCalledOnce()
    expect(secondRelease).toHaveBeenCalledOnce()
  })

  it('销毁后拒绝新轨并立即释放其资源', () => {
    const release = vi.fn()
    const createInstance = vi.fn(() => createFakeInstance())
    const adapter = new LibassSubtitleAdapter({} as HTMLVideoElement, vi.fn(), createInstance)
    adapter.dispose()

    adapter.setTrack('late.ass', release)

    expect(createInstance).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledOnce()
  })
})
