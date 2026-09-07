import type { Observable } from 'rxjs'

/** 播放核心可消费的媒体来源，不携带平台释放逻辑。 */
export interface PlaybackSourceOptions {
  id: string
  title?: string
  mimeType?: string
  startTime?: number
  timeline?: {
    originalDuration: number
    offset: number
    calibrated: boolean
  }
  autoplay?: boolean
}

/** Canvas 通过会话内资源标识解析来源，不伪造 video URL。 */
export type PlaybackSource = PlaybackSourceOptions &
  ({ engine?: 'native'; url: string } | { engine: 'canvas'; resourceId: string })

export interface MediaAudioTrack {
  id: number
  label: string
  language: string
  codec: string | null
  channels: number
  default: boolean
}

export interface MediaPresentation {
  engine: 'native' | 'canvas'
  firstFrame: boolean
  buffering: boolean
  width: number
  height: number
  /** 视频帧时间戳采样估算值，不是实时渲染 FPS。 */
  videoFrameRate?: number
  /** 最近约一秒实际解码输出速率；undefined 表示尚未采集或平台不支持。 */
  decodeFps?: number
  backend: 'native' | 'webcodecs' | 'hevc-wasm' | 'unknown'
  colorOutput?: 'sdr' | 'hdr-to-sdr'
  videoCodec?: string
  fallbackReason?: string
  linearMemoryBytes?: number
  peakLinearMemoryBytes?: number
  decoderWorkerCount?: number
  renderedFrames?: number
  droppedFrames?: number
  videoQueuePeak?: number
  audioAheadPeak?: number
  decodeThreads?: number
  audioOutputChannels?: number
}

export type PlaybackErrorCode =
  'source-unavailable' | 'not-supported' | 'decode' | 'network' | 'aborted' | 'unknown'

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

export type PlaybackMediaRestoreState = Pick<
  PlaybackMediaSnapshot,
  'currentTime' | 'volume' | 'muted' | 'rate' | 'paused'
>

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
  getPresentation?: () => MediaPresentation
  getAudioTracks?: () => { tracks: readonly MediaAudioTrack[]; selectedId?: number }
  selectAudioTrack?: (id: number) => Promise<void>
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
