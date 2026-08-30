import type { Observable } from 'rxjs'

/** 播放核心可消费的媒体来源，不携带平台释放逻辑。 */
export interface PlaybackSource {
  id: string
  url: string
  title?: string
  mimeType?: string
  startTime?: number
  autoplay?: boolean
}

export type PlaybackErrorCode =
  | 'source-unavailable'
  | 'not-supported'
  | 'decode'
  | 'network'
  | 'aborted'
  | 'unknown'

export interface PlaybackError {
  code: PlaybackErrorCode
  message: string
  recoverable: boolean
  cause?: unknown
}

export interface PlaybackMediaSnapshot {
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  rate: number
  paused: boolean
  seeking: boolean
  ended: boolean
  buffered: ReadonlyArray<readonly [start: number, end: number]>
}

/** 高频消费者按需读取的媒体时钟，不产生 RxJS/React 更新。 */
export interface PlaybackClock {
  now: () => number
  snapshot: () => Readonly<PlaybackMediaSnapshot>
}

export type PlaybackState =
  | { status: 'idle' }
  | { status: 'loading'; source: PlaybackSource }
  | {
      status: 'ready'
      source: PlaybackSource
      duration: number
      currentTime: number
      rate: number
    }
  | {
      status: 'playing'
      source: PlaybackSource
      duration: number
      currentTime: number
      rate: number
    }
  | {
      status: 'paused'
      source: PlaybackSource
      duration: number
      currentTime: number
      rate: number
    }
  | {
      status: 'seeking'
      source: PlaybackSource
      duration: number
      targetTime: number
      resumeAfterSeek: boolean
      rate: number
    }
  | { status: 'ended'; source: PlaybackSource; duration: number; rate: number }
  | { status: 'error'; source?: PlaybackSource; error: PlaybackError }

export type MediaEvent = { sessionId: number } & (
  | { type: 'load-start' }
  | { type: 'metadata'; snapshot: PlaybackMediaSnapshot }
  | { type: 'can-play'; snapshot: PlaybackMediaSnapshot }
  | { type: 'play'; snapshot: PlaybackMediaSnapshot }
  | { type: 'pause'; snapshot: PlaybackMediaSnapshot }
  | { type: 'time-update'; snapshot: PlaybackMediaSnapshot }
  | { type: 'seeking'; snapshot: PlaybackMediaSnapshot }
  | { type: 'seeked'; snapshot: PlaybackMediaSnapshot }
  | { type: 'ended'; snapshot: PlaybackMediaSnapshot }
  | { type: 'volume-change'; snapshot: PlaybackMediaSnapshot }
  | { type: 'rate-change'; snapshot: PlaybackMediaSnapshot }
  | { type: 'error'; error: PlaybackError }
)

/**
 * 媒体后端 Port。实现可以依赖 DOM 或未来的其他后端，core 只消费该契约。
 */
export interface MediaPort {
  readonly events$: Observable<MediaEvent>
  setSource: (source: PlaybackSource | null, sessionId: number) => void
  play: () => Promise<void>
  pause: () => void
  seek: (time: number) => void
  setVolume: (volume: number) => void
  setMuted: (muted: boolean) => void
  setRate: (rate: number) => void
  getSnapshot: () => PlaybackMediaSnapshot
  destroy: () => void
}
