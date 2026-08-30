import type {
  MediaEvent,
  MediaPort,
  PlaybackError,
  PlaybackMediaSnapshot,
  PlaybackSource,
} from '@marchen/playback-core'
import { Subject } from 'rxjs'

const MEDIA_EVENT_TYPES = [
  'loadstart',
  'loadedmetadata',
  'canplay',
  'play',
  'pause',
  'timeupdate',
  'seeking',
  'seeked',
  'ended',
  'volumechange',
  'ratechange',
  'error',
] as const

type SupportedMediaEvent = (typeof MEDIA_EVENT_TYPES)[number]

/** 将原生 video 元素适配成与 DOM 无关的 MediaPort。 */
export class HtmlVideoMediaAdapter implements MediaPort {
  private readonly eventSubject = new Subject<MediaEvent>()
  private listeners: Array<readonly [SupportedMediaEvent, EventListener]> = []
  private destroyed = false

  readonly events$ = this.eventSubject.asObservable()

  constructor(private readonly video: HTMLVideoElement) {
    video.playsInline = true
    video.preload = 'metadata'
  }

  setSource(source: PlaybackSource | null, sessionId: number): void {
    if (this.destroyed) return
    this.detachListeners()
    this.video.pause()
    this.video.removeAttribute('src')

    if (!source) {
      this.video.load()
      return
    }

    this.attachListeners(sessionId)
    this.video.src = source.url
    this.video.load()
  }

  play(): Promise<void> {
    return this.video.play()
  }

  pause(): void {
    this.video.pause()
  }

  seek(time: number): void {
    this.video.currentTime = time
  }

  setVolume(volume: number): void {
    this.video.volume = volume
  }

  setMuted(muted: boolean): void {
    this.video.muted = muted
  }

  setRate(rate: number): void {
    this.video.playbackRate = rate
  }

  getSnapshot(): PlaybackMediaSnapshot {
    return {
      currentTime: finiteOr(this.video.currentTime, 0),
      duration: finiteOr(this.video.duration, 0),
      volume: finiteOr(this.video.volume, 1),
      muted: this.video.muted,
      rate: finiteOr(this.video.playbackRate, 1),
      paused: this.video.paused,
      seeking: this.video.seeking,
      ended: this.video.ended,
      buffered: readTimeRanges(this.video.buffered),
    }
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.detachListeners()
    this.video.pause()
    this.video.removeAttribute('src')
    this.video.load()
    this.eventSubject.complete()
  }

  private attachListeners(sessionId: number): void {
    for (const type of MEDIA_EVENT_TYPES) {
      const listener: EventListener = () => {
        if (this.destroyed) return
        const event = this.mapEvent(type, sessionId)
        if (event) this.eventSubject.next(event)
      }
      this.video.addEventListener(type, listener)
      this.listeners.push([type, listener])
    }
  }

  private detachListeners(): void {
    for (const [type, listener] of this.listeners) {
      this.video.removeEventListener(type, listener)
    }
    this.listeners = []
  }

  private mapEvent(type: SupportedMediaEvent, sessionId: number): MediaEvent | null {
    switch (type) {
      case 'loadstart':
        return { type: 'load-start', sessionId }
      case 'loadedmetadata':
        return { type: 'metadata', sessionId, snapshot: this.getSnapshot() }
      case 'canplay':
        return { type: 'can-play', sessionId, snapshot: this.getSnapshot() }
      case 'play':
        return { type: 'play', sessionId, snapshot: this.getSnapshot() }
      case 'pause':
        return { type: 'pause', sessionId, snapshot: this.getSnapshot() }
      case 'timeupdate':
        return { type: 'time-update', sessionId, snapshot: this.getSnapshot() }
      case 'seeking':
        return { type: 'seeking', sessionId, snapshot: this.getSnapshot() }
      case 'seeked':
        return { type: 'seeked', sessionId, snapshot: this.getSnapshot() }
      case 'ended':
        return { type: 'ended', sessionId, snapshot: this.getSnapshot() }
      case 'volumechange':
        return { type: 'volume-change', sessionId, snapshot: this.getSnapshot() }
      case 'ratechange':
        return { type: 'rate-change', sessionId, snapshot: this.getSnapshot() }
      case 'error':
        return { type: 'error', sessionId, error: mapMediaError(this.video.error) }
    }
  }
}

const finiteOr = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback)

const readTimeRanges = (ranges: TimeRanges): ReadonlyArray<readonly [number, number]> => {
  const values: Array<readonly [number, number]> = []
  for (let index = 0; index < ranges.length; index += 1) {
    values.push([ranges.start(index), ranges.end(index)])
  }
  return values
}

export const mapMediaError = (error: MediaError | null): PlaybackError => {
  switch (error?.code) {
    case 1:
      return { code: 'aborted', message: '媒体加载已取消', recoverable: true, cause: error }
    case 2:
      return { code: 'network', message: '读取媒体时网络连接失败', recoverable: true, cause: error }
    case 3:
      return { code: 'decode', message: '当前环境无法解码该媒体', recoverable: false, cause: error }
    case 4:
      return {
        code: 'not-supported',
        message: '当前环境不支持该媒体格式或编码',
        recoverable: false,
        cause: error,
      }
    default:
      return { code: 'unknown', message: error?.message || '媒体播放失败', recoverable: true, cause: error }
  }
}
