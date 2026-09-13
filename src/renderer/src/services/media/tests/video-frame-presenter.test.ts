import { afterEach, describe, expect, it, vi } from 'vitest'
import { VideoFramePresenter } from '../compat/video-frame-presenter'

const setup = (write: () => Promise<void> = async () => {}) => {
  const outputs: { close: ReturnType<typeof vi.fn> }[] = []
  const tracks: { stop: ReturnType<typeof vi.fn> }[] = []
  const callbacks = new Map<number, () => void>()
  let id = 0
  vi.stubGlobal(
    'VideoFrame',
    class {
      close = vi.fn()
      constructor() {
        outputs.push(this)
      }
    },
  )
  vi.stubGlobal('MediaStream', class {})
  vi.stubGlobal(
    'MediaStreamTrackGenerator',
    class {
      stop = vi.fn()
      writable = { getWriter: () => ({ write, abort: async () => {} }) }
      constructor() {
        tracks.push(this)
      }
    },
  )
  const video = {
    addEventListener: vi.fn((_type: string, fn: () => void) => queueMicrotask(fn)),
    removeEventListener: vi.fn(),
    muted: false,
    playsInline: false,
    srcObject: null,
    play: vi.fn(async () => {}),
    pause: vi.fn(),
    requestVideoFrameCallback: (fn: () => void) => {
      callbacks.set(++id, fn)
      return id
    },
    cancelVideoFrameCallback: (key: number) => callbacks.delete(key),
  }
  const frame = () => ({ colorSpace: { transfer: 'pq', primaries: 'bt2020' }, close: vi.fn() })
  const display = () => {
    const pending = [...callbacks.values()]
    callbacks.clear()
    pending.forEach((fn) => fn())
  }
  return {
    presenter: new VideoFramePresenter(video as unknown as HTMLVideoElement, 100),
    video,
    frame,
    display,
    outputs,
    tracks,
  }
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe('唯一 video 呈现器', () => {
  it('写入不等于首帧显示，收到回调才就绪并关闭原帧与包装帧', async () => {
    const s = setup()
    const frame = s.frame()
    let done = false
    const pending = s.presenter
      .present(frame as unknown as VideoFrame, () => true)
      .then(() => {
        done = true
      })
    await vi.waitFor(() => expect(s.presenter.submittedFrames).toBe(1))
    expect(done).toBe(false)
    s.display()
    await pending
    expect(s.presenter.presentedFrames).toBe(1)
    expect(frame.close).toHaveBeenCalledTimes(1)
    expect(s.outputs[0].close).toHaveBeenCalledTimes(1)
    expect(s.video.pause).not.toHaveBeenCalled()
    s.presenter.dispose()
  })
  it('等待新流 loadstart 后才写首帧，挂载期间取消不会继续写入', async () => {
    const write = vi.fn(async () => {})
    const s = setup(write)
    s.video.addEventListener.mockImplementation(() => {})
    const frame = s.frame()
    const pending = expect(
      s.presenter.present(frame as unknown as VideoFrame, () => true),
    ).rejects.toThrow('取消')
    await Promise.resolve()
    expect(write).not.toHaveBeenCalled()
    s.presenter.dispose()
    await pending
    expect(frame.close).toHaveBeenCalledTimes(1)
    expect(s.video.removeEventListener).toHaveBeenCalled()
  })
  it('没有显示回调会有限超时', async () => {
    vi.useFakeTimers()
    const s = setup()
    const frame = s.frame()
    const failure = expect(
      s.presenter.present(frame as unknown as VideoFrame, () => true),
    ).rejects.toThrow('超时')
    await vi.advanceTimersByTimeAsync(101)
    await failure
    expect(frame.close).toHaveBeenCalledTimes(1)
    s.presenter.dispose()
  })
  it('失效立即取消挂起写入，新代次可继续且释放不重复', async () => {
    const s = setup(() => new Promise(() => {}))
    const frame = s.frame()
    const failure = expect(
      s.presenter.present(frame as unknown as VideoFrame, () => true),
    ).rejects.toThrow('取消')
    s.presenter.invalidate()
    await failure
    expect(frame.close).toHaveBeenCalledTimes(1)
    expect(s.outputs[0].close).toHaveBeenCalledTimes(1)
    expect(s.tracks[0].stop).toHaveBeenCalledTimes(1)
    s.presenter.dispose()
    s.presenter.dispose()
    expect(s.tracks[0].stop).toHaveBeenCalledTimes(1)
  })
  it('背压拒绝额外在途帧，不丢失其所有权', async () => {
    const s = setup(() => new Promise(() => {}))
    const frame = s.frame();
      const extra = s.frame()
    const pending = expect(
      s.presenter.present(frame as unknown as VideoFrame, () => true),
    ).rejects.toThrow('取消')
    await expect(s.presenter.present(extra as unknown as VideoFrame, () => true)).rejects.toThrow(
      '队列已满',
    )
    expect(extra.close).toHaveBeenCalledTimes(1)
    s.presenter.dispose()
    await pending
  })
  it('迟到或已关闭帧不会建立新轨道', async () => {
    const s = setup()
    const frame = s.frame()
    await s.presenter.present(frame as unknown as VideoFrame, () => false)
    expect(frame.close).toHaveBeenCalledTimes(1)
    expect(s.tracks).toHaveLength(0)
    s.presenter.dispose()
  })
  it('播放拒绝时释放帧并传递错误', async () => {
    const s = setup()
    s.video.play.mockRejectedValue(new Error('播放被拒绝'))
    const frame = s.frame()
    await expect(s.presenter.present(frame as unknown as VideoFrame, () => true)).rejects.toThrow(
      '播放被拒绝',
    )
    expect(frame.close).toHaveBeenCalledTimes(1)
    s.presenter.dispose()
  })
})
