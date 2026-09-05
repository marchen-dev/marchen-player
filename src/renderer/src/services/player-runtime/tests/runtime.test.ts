import type {
  MediaEvent,
  MediaPort,
  PlaybackMediaSnapshot,
  PlaybackSource,
} from '@marchen/playback-core'
import { Subject } from 'rxjs'
import { describe, expect, it, vi } from 'vitest'
import { HtmlVideoMediaAdapter, mapMediaError } from '../adapters'
import { PlayerRuntime } from '../runtime'

const source = (id: string): PlaybackSource => ({ id, url: `media://${id}` })

class FakeVideo extends EventTarget {
  playsInline = false
  preload = ''
  src = ''
  currentTime = 0
  duration = 120
  volume = 1
  muted = false
  playbackRate = 1
  paused = true
  seeking = false
  ended = false
  buffered: TimeRanges = {
    length: 1,
    start: () => 0,
    end: () => 60,
  }
  error: MediaError | null = null
  readyState = 0
  load = vi.fn()
  pause = vi.fn(() => {
    this.paused = true
  })
  play = vi.fn(async () => {
    this.paused = false
  })

  removeAttribute(name: string) {
    if (name === 'src') this.src = ''
  }
}

const snapshot = (): PlaybackMediaSnapshot => ({
  currentTime: 0,
  duration: 120,
  volume: 1,
  muted: false,
  rate: 1,
  paused: true,
  seeking: false,
  ended: false,
  buffered: [],
})

const createMediaPort = (order: string[] = []) => {
  const events = new Subject<MediaEvent>()
  const media: MediaPort = {
    events$: events.asObservable(),
    setSource: vi.fn((value) => {
      if (!value) order.push('session')
    }),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    setMuted: vi.fn(),
    setRate: vi.fn(),
    getSnapshot: vi.fn(snapshot),
    destroy: vi.fn(() => order.push('media')),
  }
  return { events, media }
}

describe('htmlVideoMediaAdapter', () => {
  it('映射事件、快照和换源 sessionId', () => {
    const video = new FakeVideo()
    const adapter = new HtmlVideoMediaAdapter(video as unknown as HTMLVideoElement)
    const received: MediaEvent[] = []
    adapter.events$.subscribe((event) => received.push(event))

    adapter.setSource(source('first'), 1)
    video.currentTime = 12
    video.dispatchEvent(new Event('loadedmetadata'))
    adapter.setSource(source('second'), 2)
    video.dispatchEvent(new Event('play'))

    expect(received[0]).toMatchObject({ type: 'metadata', sessionId: 1 })
    expect(received[1]).toMatchObject({ type: 'play', sessionId: 2 })
    expect(adapter.getSnapshot()).toMatchObject({ currentTime: 12, buffered: [[0, 60]] })
  })

  it('销毁后解绑事件并清空媒体来源', () => {
    const video = new FakeVideo()
    const adapter = new HtmlVideoMediaAdapter(video as unknown as HTMLVideoElement)
    const listener = vi.fn()
    adapter.events$.subscribe(listener)
    adapter.setSource(source('destroy'), 1)

    adapter.destroy()
    video.dispatchEvent(new Event('play'))

    expect(listener).not.toHaveBeenCalled()
    expect(video.src).toBe('')
    expect(video.pause).toHaveBeenCalled()
    expect(video.load).toHaveBeenCalled()
  })

  it('等待新 generation 实际有可播数据', async () => {
    const video = new FakeVideo()
    const adapter = new HtmlVideoMediaAdapter(video as unknown as HTMLVideoElement)
    const waiting = adapter.waitForPlayableData()
    video.readyState = 2
    video.dispatchEvent(new Event('loadeddata'))
    await expect(waiting).resolves.toBeUndefined()
  })

  it('区分网络、解码与不支持错误', () => {
    expect(mapMediaError({ code: 2, message: '' } as MediaError)).toMatchObject({
      code: 'network',
      recoverable: true,
    })
    expect(mapMediaError({ code: 3, message: '' } as MediaError)).toMatchObject({
      code: 'decode',
      recoverable: false,
    })
    expect(mapMediaError({ code: 4, message: '' } as MediaError)).toMatchObject({
      code: 'not-supported',
      recoverable: false,
    })
  })
})

describe('playerRuntime', () => {
  const lease = (id: string, release: () => void) => ({
    id,
    logicalSourceId: id,
    mode: 'direct' as const,
    transport: 'custom-protocol' as const,
    url: `marchen:///${id}`,
    timeline: { originalDuration: 0, offset: 0, calibrated: false },
    release,
  })

  it('播放心跳读取真实时钟，换源与销毁后不再报告旧 lease', async () => {
    vi.useFakeTimers()
    const { media } = createMediaPort()
    const runtime = new PlayerRuntime(media)
    const reportPlayback = vi.fn()
    try {
      runtime.load(source('heartbeat'), { ...lease('heartbeat', vi.fn()), reportPlayback })
      vi.mocked(media.getSnapshot).mockReturnValue({ ...snapshot(), currentTime: 17 })
      await vi.advanceTimersByTimeAsync(5_000)
      expect(reportPlayback).toHaveBeenLastCalledWith(17)
      expect(() => runtime.playbackInfo).not.toThrow()
      runtime.load(source('next'), lease('next', vi.fn()))
      const count = reportPlayback.mock.calls.length
      await vi.advanceTimersByTimeAsync(10_000)
      expect(reportPlayback).toHaveBeenCalledTimes(count)
      runtime.destroy()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      runtime.destroy()
      vi.useRealTimers()
    }
  })

  it('换源先释放旧来源并忽略旧事件', () => {
    const order: string[] = []
    const { events, media } = createMediaPort(order)
    const runtime = new PlayerRuntime(media)
    runtime.load(
      source('first'),
      lease('first', () => order.push('first-source')),
    )
    runtime.load(
      source('second'),
      lease('second', () => order.push('second-source')),
    )

    events.next({ type: 'play', sessionId: 1, snapshot: snapshot() })

    expect(order).toContain('first-source')
    expect(runtime.state).toMatchObject({ status: 'loading', source: { id: 'second' } })
  })

  it('兼容 lease seek 后替换 HLS generation 并恢复媒体状态', async () => {
    const { media } = createMediaPort()
    const runtime = new PlayerRuntime(media)
    runtime.load(source('compatible'), {
      ...lease('compatible', vi.fn()),
      mode: 'transcode-video',
      transport: 'hls',
      generation: 0,
      sessionId: 'session',
      seek: async (logicalTime) => ({
        id: 'compatible:1',
        logicalSourceId: 'compatible',
        mode: 'transcode-video',
        transport: 'hls',
        url: 'http://127.0.0.1/g/1/index.m3u8',
        mimeType: 'application/vnd.apple.mpegurl',
        generation: 1,
        sessionId: 'session',
        timeline: { originalDuration: 120, offset: logicalTime, calibrated: true },
      }),
    })

    runtime.commands.seek(45)
    await vi.waitFor(() =>
      expect(media.setSource).toHaveBeenLastCalledWith(
        expect.objectContaining({
          url: 'http://127.0.0.1/g/1/index.m3u8',
          mimeType: 'application/vnd.apple.mpegurl',
          timeline: { originalDuration: 120, offset: 45, calibrated: true },
        }),
        2,
      ),
    )
    expect(media.setVolume).toHaveBeenCalledWith(1)
    expect(media.setRate).toHaveBeenCalledWith(1)
  })

  it('generation seek 立即锁定 UI 目标，等 transport/可播数据后才恢复', async () => {
    const { media } = createMediaPort()
    let resolveTransport!: () => void
    let resolvePlayable!: () => void
    const transport = new Promise<void>((resolve) => (resolveTransport = resolve))
    const playable = new Promise<void>((resolve) => (resolvePlayable = resolve))
    const runtimeMedia = Object.assign(media, {
      waitForTransportReady: vi.fn(() => transport),
      waitForPlayableData: vi.fn(() => playable),
    })
    const runtime = new PlayerRuntime(runtimeMedia)
    runtime.load(source('ordered-seek'), {
      ...lease('ordered-seek', vi.fn()),
      mode: 'transcode-video',
      transport: 'hls',
      generation: 0,
      sessionId: 'session',
      seek: async (logicalTime) => ({
        id: 'ordered-seek:1',
        logicalSourceId: 'ordered-seek',
        mode: 'transcode-video',
        transport: 'hls',
        url: 'http://127.0.0.1/g/1/index.m3u8',
        mimeType: 'application/vnd.apple.mpegurl',
        generation: 1,
        sessionId: 'session',
        timeline: { originalDuration: 120, offset: logicalTime + 0.04, calibrated: true },
      }),
    })

    runtime.commands.seek(45)
    expect(runtime.state).toMatchObject({ status: 'seeking', targetTime: 45 })
    expect(media.seek).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(runtimeMedia.waitForTransportReady).toHaveBeenCalledOnce())
    expect(media.setVolume).not.toHaveBeenCalled()
    resolveTransport()
    await vi.waitFor(() => expect(runtimeMedia.waitForPlayableData).toHaveBeenCalledOnce())
    expect(media.setVolume).not.toHaveBeenCalled()
    vi.mocked(media.getSnapshot).mockReturnValue({ ...snapshot(), currentTime: 12 })
    resolvePlayable()
    await vi.waitFor(() => expect(media.setVolume).toHaveBeenCalledWith(1))
    expect(media.seek).toHaveBeenCalledWith(0)
  })

  it('seek 失败退出 seeking，重试保留音量倍速并隔离旧媒体事件', async () => {
    const { media, events } = createMediaPort()
    vi.mocked(media.getSnapshot).mockReturnValue({ ...snapshot(), volume: 0.4, rate: 1.5 })
    const runtime = new PlayerRuntime(media, vi.fn())
    const seek = vi
      .fn()
      .mockRejectedValueOnce(new Error('生产失败'))
      .mockResolvedValueOnce({
        ...lease('retry', vi.fn()),
        timeline: { originalDuration: 120, offset: 20, calibrated: true },
      })
    runtime.load(source('retry'), { ...lease('retry', vi.fn()), seek })
    runtime.commands.seek(10)
    await vi.waitFor(() => expect(runtime.state.status).toBe('error'))
    events.next({ type: 'can-play', sessionId: 1, snapshot: snapshot() })
    expect(runtime.state.status).toBe('error')
    vi.mocked(media.getSnapshot).mockReturnValue(snapshot())
    runtime.commands.seek(20)
    await vi.waitFor(() => expect(runtime.state.status).toBe('paused'))
    expect(seek).toHaveBeenCalledTimes(2)
    expect(media.setVolume).toHaveBeenLastCalledWith(0.4)
    expect(media.setRate).toHaveBeenLastCalledWith(1.5)
    runtime.destroy()
  })

  it('seek 超时后迟到结果不能重新挂载', async () => {
    vi.useFakeTimers()
    try {
      const { media } = createMediaPort()
      const runtime = new PlayerRuntime(media, vi.fn())
      let finish!: (value: ReturnType<typeof lease>) => void
      const pending = new Promise<ReturnType<typeof lease>>((resolve) => {
        finish = resolve
      })
      runtime.load(source('timeout'), { ...lease('timeout', vi.fn()), seek: () => pending })
      runtime.commands.seek(20)
      await vi.advanceTimersByTimeAsync(5_000)
      expect(runtime.state.status).toBe('error')
      const calls = vi.mocked(media.setSource).mock.calls.length
      finish(lease('late', vi.fn()))
      await vi.advanceTimersByTimeAsync(0)
      expect(media.setSource).toHaveBeenCalledTimes(calls)
      runtime.destroy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('stable-vod seek 5 秒超时销毁加载并释放 lease，不挂起到分片 10 秒期限', async () => {
    vi.useFakeTimers()
    try {
      const { media, events } = createMediaPort()
      const release = vi.fn()
      const runtime = new PlayerRuntime(media)
      runtime.load(source('stable-timeout'), {
        ...lease('stable-timeout', release),
        hlsSessionMode: 'stable-vod',
      })
      runtime.commands.seek(100)
      expect(runtime.state.status).toBe('seeking')
      // 旧缓冲的 canplay 不是目标分片恢复证据，不能撤销 deadline。
      events.next({ type: 'can-play', sessionId: 1, snapshot: snapshot() })
      await vi.advanceTimersByTimeAsync(5000)
      expect(runtime.state.status).toBe('error')
      expect(media.setSource).toHaveBeenLastCalledWith(null, expect.any(Number))
      expect(release).toHaveBeenCalledOnce()
      events.next({ type: 'seeked', sessionId: 1, snapshot: { ...snapshot(), currentTime: 100 } })
      expect(runtime.state.status).toBe('error')
      runtime.destroy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('stable-vod seek 成功后取消超时，不释放正在播放的 lease', async () => {
    vi.useFakeTimers()
    try {
      const { media, events } = createMediaPort()
      const release = vi.fn()
      const runtime = new PlayerRuntime(media)
      runtime.load(source('stable-success'), {
        ...lease('stable-success', release),
        hlsSessionMode: 'stable-vod',
      })
      runtime.commands.seek(20)
      events.next({ type: 'seeked', sessionId: 1, snapshot: { ...snapshot(), currentTime: 20 } })
      await vi.advanceTimersByTimeAsync(5000)
      expect(runtime.state.status).toBe('paused')
      expect(release).not.toHaveBeenCalled()
      runtime.destroy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('seek 期间切集，迟到结果不覆盖新媒体或恢复旧设置', async () => {
    const { media } = createMediaPort()
    const runtime = new PlayerRuntime(media, vi.fn())
    let finish!: (value: ReturnType<typeof lease>) => void
    const pending = new Promise<ReturnType<typeof lease>>((resolve) => {
      finish = resolve
    })
    runtime.load(source('old'), { ...lease('old', vi.fn()), seek: () => pending })
    runtime.commands.seek(20)
    runtime.load(source('new'), lease('new', vi.fn()))
    finish(lease('late', vi.fn()))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(runtime.state).toMatchObject({ source: { id: 'new' } })
    expect(media.setVolume).not.toHaveBeenCalled()
    runtime.destroy()
  })

  it('按固定阶段销毁所有资源，单个失败不阻断后续清理', () => {
    const order: string[] = []
    const errors = vi.fn()
    const { media } = createMediaPort(order)
    const runtime = new PlayerRuntime(media, errors)
    runtime.registerDisposer('ui-frame', () => order.push('ui-frame'))
    runtime.registerDisposer('danmaku', () => order.push('danmaku'))
    runtime.registerDisposer('subtitle', () => {
      order.push('subtitle')
      throw new Error('dispose failed')
    })
    runtime.registerDisposer('observer', () => order.push('observer'))
    runtime.load(
      source('dispose'),
      lease('dispose', () => order.push('source')),
    )

    runtime.destroy()

    expect(order).toEqual([
      'ui-frame',
      'danmaku',
      'subtitle',
      'observer',
      'session',
      'media',
      'source',
    ])
    expect(errors).toHaveBeenCalledOnce()
  })
})
