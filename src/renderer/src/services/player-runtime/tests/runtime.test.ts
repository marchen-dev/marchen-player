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
  it('换源先释放旧来源并忽略旧事件', () => {
    const order: string[] = []
    const { events, media } = createMediaPort(order)
    const runtime = new PlayerRuntime(media)
    runtime.load(source('first'), () => order.push('first-source'))
    runtime.load(source('second'), () => order.push('second-source'))

    events.next({ type: 'play', sessionId: 1, snapshot: snapshot() })

    expect(order).toContain('first-source')
    expect(runtime.state).toMatchObject({ status: 'loading', source: { id: 'second' } })
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
    runtime.load(source('dispose'), () => order.push('source'))

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
