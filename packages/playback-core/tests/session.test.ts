import type { MediaEvent, MediaPort, PlaybackMediaSnapshot, PlaybackSource } from '../src/types'
import { Subject } from 'rxjs'
import { describe, expect, it, vi } from 'vitest'
import { PlaybackSession } from '../src/session'

const source = (id: string, autoplay = false): PlaybackSource => ({
  id,
  url: `media://${id}`,
  autoplay,
})

const snapshot = (overrides: Partial<PlaybackMediaSnapshot> = {}): PlaybackMediaSnapshot => ({
  currentTime: 0,
  duration: 120,
  volume: 1,
  muted: false,
  rate: 1,
  paused: true,
  seeking: false,
  ended: false,
  buffered: [],
  ...overrides,
})

const createMedia = () => {
  const events = new Subject<MediaEvent>()
  let currentSnapshot = snapshot()
  const media: MediaPort = {
    events$: events.asObservable(),
    setSource: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    setMuted: vi.fn(),
    setRate: vi.fn(),
    getSnapshot: vi.fn(() => currentSnapshot),
    destroy: vi.fn(),
  }

  return {
    events,
    media,
    setSnapshot(value: Partial<PlaybackMediaSnapshot>) {
      currentSnapshot = snapshot(value)
    },
  }
}

describe('playbackSession', () => {
  it('autoplay 的 play 先于 metadata 时仍保持 playing', () => {
    const { events, media } = createMedia()
    const session = new PlaybackSession(media)
    session.load(source('autoplay', true))
    events.next({ type: 'play', sessionId: 1, snapshot: snapshot({ paused: false }) })
    events.next({
      type: 'metadata',
      sessionId: 1,
      snapshot: snapshot({ paused: false, duration: 120 }),
    })

    expect(session.currentState.status).toBe('playing')
  })

  it('映射基础命令并约束 seek 和音量', () => {
    const { media } = createMedia()
    const session = new PlaybackSession(media)

    session.load(source('one'))
    session.seek(999)
    session.setVolume(2)
    session.setMuted(true)
    session.setRate(1.5)
    session.pause()

    expect(media.setSource).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'one' }), 1)
    expect(media.seek).toHaveBeenCalledWith(120)
    expect(media.setVolume).toHaveBeenCalledWith(1)
    expect(media.setMuted).toHaveBeenCalledWith(true)
    expect(media.setRate).toHaveBeenCalledWith(1.5)
    expect(media.pause).toHaveBeenCalled()
  })

  it('autoplay 被拒绝时保持可交互暂停态', async () => {
    const { media } = createMedia()
    vi.mocked(media.play).mockRejectedValueOnce({ name: 'NotAllowedError' })
    const session = new PlaybackSession(media)

    session.load(source('autoplay', true))
    await session.play()

    expect(session.currentState.status).toBe('paused')
  })

  it('媒体错误进入结构化 error 状态', () => {
    const { events, media } = createMedia()
    const session = new PlaybackSession(media)
    session.load(source('broken'))

    events.next({
      type: 'error',
      sessionId: 1,
      error: {
        code: 'decode',
        message: '无法解码',
        recoverable: false,
      },
    })

    expect(session.currentState).toMatchObject({
      status: 'error',
      error: { code: 'decode' },
    })
  })

  it('play 的不支持错误被分类为不可恢复兼容错误', async () => {
    const { media } = createMedia()
    vi.mocked(media.play).mockRejectedValueOnce({
      name: 'NotSupportedError',
      message: 'codec is not supported',
    })
    const session = new PlaybackSession(media)
    session.load(source('unsupported'))

    await session.play()

    expect(session.currentState).toMatchObject({
      status: 'error',
      error: { code: 'not-supported', recoverable: false },
    })
  })

  it('从 playing seek 后恢复播放', async () => {
    const { events, media, setSnapshot } = createMedia()
    const session = new PlaybackSession(media)
    session.load(source('seek'))

    setSnapshot({ paused: false, currentTime: 10 })
    events.next({ type: 'play', sessionId: 1, snapshot: snapshot({ paused: false }) })
    session.seek(40)
    expect(session.currentState).toMatchObject({
      status: 'seeking',
      targetTime: 40,
      resumeAfterSeek: true,
    })

    events.next({
      type: 'seeked',
      sessionId: 1,
      snapshot: snapshot({ currentTime: 40, paused: false }),
    })
    await Promise.resolve()

    expect(session.currentState.status).toBe('playing')
    expect(media.play).toHaveBeenCalled()
  })

  it('ended 公开完成状态', () => {
    const { events, media } = createMedia()
    const session = new PlaybackSession(media)
    session.load(source('ended'))

    events.next({
      type: 'ended',
      sessionId: 1,
      snapshot: snapshot({ currentTime: 120, ended: true }),
    })

    expect(session.currentState).toMatchObject({ status: 'ended', duration: 120 })
  })

  it('换源和取消后忽略旧 sessionId 的迟到事件', () => {
    const { events, media } = createMedia()
    const session = new PlaybackSession(media)
    session.load(source('first'))
    session.load(source('second'))

    events.next({ type: 'play', sessionId: 1, snapshot: snapshot({ paused: false }) })
    expect(session.currentState).toMatchObject({ status: 'loading', source: { id: 'second' } })

    session.cancel()
    events.next({ type: 'play', sessionId: 2, snapshot: snapshot({ paused: false }) })
    expect(session.currentState.status).toBe('idle')
  })

  it('destroy 后释放 Port 且不再接收事件或命令', async () => {
    const { events, media } = createMedia()
    const session = new PlaybackSession(media)
    session.load(source('destroy'))
    session.destroy()

    events.next({ type: 'play', sessionId: 1, snapshot: snapshot({ paused: false }) })
    await session.play()

    expect(session.currentState.status).toBe('idle')
    expect(media.setSource).toHaveBeenLastCalledWith(null, 2)
    expect(media.destroy).toHaveBeenCalledOnce()
    expect(media.play).not.toHaveBeenCalled()
  })

  it('只读时钟按需读取快照且不发布状态', () => {
    const { media, setSnapshot } = createMedia()
    const session = new PlaybackSession(media)
    const states = vi.fn()
    session.state$.subscribe(states)
    session.load(source('clock'))
    const emissionCount = states.mock.calls.length

    setSnapshot({ currentTime: 42, buffered: [[0, 30]] })
    expect(session.clock.now()).toBe(42)
    expect(session.clock.snapshot()).toMatchObject({ currentTime: 42, buffered: [[0, 30]] })
    expect(states).toHaveBeenCalledTimes(emissionCount)
  })

  it('把 generation 局部时间映射为原视频逻辑时间', () => {
    const { events, media, setSnapshot } = createMedia()
    const session = new PlaybackSession(media)
    session.load({
      ...source('generation'),
      timeline: { originalDuration: 3_600, offset: 1_800, calibrated: true },
    })

    const local = snapshot({ currentTime: 5, duration: 100, buffered: [[0, 20]] })
    setSnapshot(local)
    events.next({ type: 'metadata', sessionId: 1, snapshot: local })
    expect(session.currentState).toMatchObject({
      status: 'ready',
      currentTime: 1_805,
      duration: 3_600,
    })
    expect(session.clock.now()).toBe(1_805)
    expect(session.clock.snapshot().buffered).toEqual([[1_800, 1_820]])

    session.seek(1_850)
    expect(session.currentState).toMatchObject({ targetTime: 1_850, duration: 3_600 })
    expect(media.seek).toHaveBeenCalledWith(50)

    events.next({ type: 'ended', sessionId: 1, snapshot: local })
    expect(session.currentState).toMatchObject({ status: 'ended', duration: 3_600 })
  })

  it('换 generation 后按逻辑时间恢复播放参数并在 seeked 后续播', async () => {
    const { events, media, setSnapshot } = createMedia()
    const session = new PlaybackSession(media)
    session.load({
      ...source('replacement'),
      timeline: { originalDuration: 3_600, offset: 1_800, calibrated: true },
    })
    setSnapshot({ duration: 100, currentTime: 0, paused: true })
    session.restore({ currentTime: 1_845, volume: 0.4, muted: true, rate: 1.5, paused: false })

    expect(media.setVolume).toHaveBeenCalledWith(0.4)
    expect(media.setMuted).toHaveBeenCalledWith(true)
    expect(media.setRate).toHaveBeenCalledWith(1.5)
    expect(media.seek).toHaveBeenCalledWith(45)
    expect(session.currentState).toMatchObject({
      status: 'seeking',
      targetTime: 1_845,
      resumeAfterSeek: true,
    })

    events.next({
      type: 'seeked',
      sessionId: 1,
      snapshot: snapshot({ duration: 100, currentTime: 45, paused: true }),
    })
    await Promise.resolve()
    expect(media.play).toHaveBeenCalledOnce()
    expect(session.currentState.status).toBe('playing')
  })
})
