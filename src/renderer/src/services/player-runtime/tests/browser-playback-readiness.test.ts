import { afterEach, describe, expect, it, vi } from 'vitest'
import { waitForBrowserFirstFrame } from '../browser-playback-readiness'

class FakeVideo extends EventTarget {
  duration = Number.NaN
  readyState = 0
  videoWidth = 1920
  videoHeight = 1080
  frameCallback?: () => void
  requestVideoFrameCallback = vi.fn((callback: () => void) => {
    this.frameCallback = callback
    return 1
  })
  cancelVideoFrameCallback = vi.fn()
}

afterEach(() => vi.useRealTimers())

describe('浏览器首帧确认', () => {
  it('metadata 有效且实际解码帧回调后才完成', async () => {
    const video = new FakeVideo()
    const ready = waitForBrowserFirstFrame(video as unknown as HTMLVideoElement, {
      deadlineMs: 8_000,
    })
    video.duration = 120
    video.readyState = 1
    video.dispatchEvent(new Event('loadedmetadata'))
    expect(video.requestVideoFrameCallback).toHaveBeenCalledOnce()
    video.frameCallback?.()
    await expect(ready).resolves.toBeUndefined()
  })

  it('期限内没有首帧时返回可识别的 decode 阶段错误', async () => {
    vi.useFakeTimers()
    const video = new FakeVideo()
    const ready = waitForBrowserFirstFrame(video as unknown as HTMLVideoElement, {
      deadlineMs: 8_000,
    })
    const rejected = expect(ready).rejects.toMatchObject({
      code: 'startup-deadline-exceeded',
      stage: 'decode',
    })
    await vi.advanceTimersByTimeAsync(8_000)
    await rejected
  })

  it('loadedmetadata 的 duration 无效时立即返回 metadata 阶段错误', async () => {
    const video = new FakeVideo()
    const ready = waitForBrowserFirstFrame(video as unknown as HTMLVideoElement, {
      deadlineMs: 8_000,
    })
    video.duration = Number.NaN
    video.readyState = 1
    video.dispatchEvent(new Event('loadedmetadata'))
    await expect(ready).rejects.toMatchObject({ code: 'metadata-invalid', stage: 'metadata' })
  })
})

it('仅有音频数据而没有视频尺寸时不能确认首帧', async () => {
  vi.useFakeTimers()
  const video = new FakeVideo()
  video.videoWidth = 0
  video.videoHeight = 0
  video.duration = 120
  video.readyState = 2
  const ready = waitForBrowserFirstFrame(video as unknown as HTMLVideoElement, { deadlineMs: 50 })
  const rejected = expect(ready).rejects.toMatchObject({ code: 'startup-deadline-exceeded' })
  video.dispatchEvent(new Event('loadeddata'))
  video.frameCallback?.()
  await vi.advanceTimersByTimeAsync(50)
  await rejected
})
