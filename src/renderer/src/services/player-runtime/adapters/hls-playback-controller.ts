import type { PlaybackError } from '@marchen/playback-core'
import type { MediaCompatErrorStage } from '@marchen/shared/media'
import type { HlsConfig } from 'hls.js'
import Hls from 'hls.js'
import hlsWorkerUrl from 'hls.js/dist/hls.worker.js?url'

export interface HlsPlaybackController {
  load: (url: string) => Promise<void>
  destroy: () => void
}

export interface HlsLike {
  on: (event: string, listener: (_event: string, data: unknown) => void) => void
  attachMedia: (video: HTMLVideoElement) => void
  loadSource: (url: string) => void
  startLoad: () => void
  recoverMediaError: () => void
  destroy: () => void
}

export interface HlsFactory {
  supported: boolean
  events: { mediaAttached: string; bufferCreated: string; error: string }
  errorTypes: { network: string; media: string }
  create: (config: Record<string, unknown>) => HlsLike
}

const defaultFactory: HlsFactory = {
  supported: Hls.isSupported(),
  events: {
    mediaAttached: Hls.Events.MEDIA_ATTACHED,
    bufferCreated: Hls.Events.BUFFER_CREATED,
    error: Hls.Events.ERROR,
  },
  errorTypes: { network: Hls.ErrorTypes.NETWORK_ERROR, media: Hls.ErrorTypes.MEDIA_ERROR },
  create: (config) => new Hls(config as Partial<HlsConfig>) as unknown as HlsLike,
}

interface HlsErrorData {
  fatal?: boolean
  type?: string
  details?: string
  error?: Error
}

export class HlsPlaybackControllerError extends Error {
  constructor(
    readonly code: 'mse-attach-failed' | 'manifest-invalid' | 'decode-failed',
    readonly stage: MediaCompatErrorStage,
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause })
    this.name = 'HlsPlaybackControllerError'
  }
}

const errorStage = (data: HlsErrorData, networkErrorType: string): MediaCompatErrorStage => {
  const details = data.details?.toLowerCase() ?? ''
  if (details.includes('manifest') || details.includes('level')) return 'manifest-validation'
  if (details.includes('buffer') || details.includes('sourcebuffer')) return 'mse'
  return data.type === networkErrorType ? 'manifest-validation' : 'decode'
}

export class ManagedHlsPlaybackController implements HlsPlaybackController {
  #instance?: HlsLike
  #networkRecoveries = 0
  #mediaRecoveries = 0
  #rejectAttachment?: (error: HlsPlaybackControllerError) => void

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly onFatalError: (error: PlaybackError) => void,
    private readonly factory: HlsFactory = defaultFactory,
  ) {}

  load(url: string): Promise<void> {
    this.destroy()
    if (!this.factory.supported) {
      const error = new HlsPlaybackControllerError(
        'mse-attach-failed',
        'mse',
        '当前 Chromium 不支持 HLS/MSE 兼容播放',
      )
      this.onFatalError({
        code: 'not-supported',
        message: error.message,
        recoverable: false,
        cause: error,
      })
      return Promise.reject(error)
    }
    this.#networkRecoveries = 0
    this.#mediaRecoveries = 0
    const instance = this.factory.create({
      enableWorker: true,
      workerPath: hlsWorkerUrl,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      maxBufferSize: 64 * 1024 * 1024,
      backBufferLength: 30,
      manifestLoadingMaxRetry: 3,
      fragLoadingMaxRetry: 3,
      xhrSetup: (xhr: XMLHttpRequest) => {
        xhr.withCredentials = false
      },
    })
    this.#instance = instance
    instance.on(this.factory.events.mediaAttached, () => instance.loadSource(url))
    const attachment = new Promise<void>((resolve, reject) => {
      this.#rejectAttachment = reject
      instance.on(this.factory.events.bufferCreated, () => {
        this.#rejectAttachment = undefined
        resolve()
      })
    })
    instance.on(this.factory.events.error, (_event, rawData) => {
      this.#handleError(rawData as HlsErrorData)
    })
    instance.attachMedia(this.video)
    return attachment
  }

  destroy(): void {
    this.#instance?.destroy()
    this.#instance = undefined
    this.#rejectAttachment = undefined
  }

  #handleError(data: HlsErrorData): void {
    if (!data.fatal || !this.#instance) return
    if (data.type === this.factory.errorTypes.network && this.#networkRecoveries < 2) {
      this.#networkRecoveries += 1
      this.#instance.startLoad()
      return
    }
    if (data.type === this.factory.errorTypes.media && this.#mediaRecoveries < 1) {
      this.#mediaRecoveries += 1
      this.#instance.recoverMediaError()
      return
    }
    const stage = errorStage(data, this.factory.errorTypes.network)
    const error = new HlsPlaybackControllerError(
      stage === 'manifest-validation'
        ? 'manifest-invalid'
        : stage === 'mse'
          ? 'mse-attach-failed'
          : 'decode-failed',
      stage,
      `HLS 兼容播放失败${data.details ? `：${data.details}` : ''}`,
      data.error,
    )
    this.#rejectAttachment?.(error)
    this.#rejectAttachment = undefined
    this.onFatalError({
      code: data.type === this.factory.errorTypes.network ? 'network' : 'decode',
      message: error.message,
      recoverable: false,
      cause: error,
    })
  }
}

export type HlsPlaybackControllerFactory = (
  video: HTMLVideoElement,
  onFatalError: (error: PlaybackError) => void,
) => HlsPlaybackController

export const createHlsPlaybackController: HlsPlaybackControllerFactory = (video, onFatalError) =>
  new ManagedHlsPlaybackController(video, onFatalError)
