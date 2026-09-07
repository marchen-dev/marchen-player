import type { MediaPresentation, PlaybackState } from '@marchen/playback-core'
import type { TelemetryEventMap, TelemetryEventName, TelemetrySpan } from './contracts'

import { nanoid } from 'nanoid'
import { telemetry } from './client'
import { beginPlaybackTelemetrySession, endPlaybackTelemetrySession } from './playback-session'

const SIGNIFICANT_STALL_MS = 1_000

interface PlaybackTelemetrySink {
  capture: <E extends TelemetryEventName>(name: E, properties: TelemetryEventMap[E]) => void
  breadcrumb: (message: string, data?: Record<string, unknown>) => void
  startSpan: (span: TelemetrySpan, run: () => Promise<void>) => void
}

const defaultSink: PlaybackTelemetrySink = {
  capture: (name, properties) => telemetry.capture(name, properties),
  breadcrumb: (message, data) =>
    telemetry.addBreadcrumb({ category: 'player.runtime', message, data }),
  startSpan: (span, run) => void telemetry.startSpan(span, run),
}

interface Attempt {
  id: string
  generation: number
  prepareStartedAt: number
  completed?: boolean
  engine?: 'native' | 'canvas'
  finishSpan: () => void
}

const openSpan = (sink: PlaybackTelemetrySink, span: TelemetrySpan) => {
  let finish = () => {}
  sink.startSpan(span, () => new Promise<void>((resolve) => void (finish = resolve)))
  return () => finish()
}

/** Renderer runtime 的单个逻辑媒体会话汇总器；不接收路径、URL、token 或原始错误对象。 */
export class PlaybackTelemetryObserver {
  readonly playbackSessionId: string

  #attempt?: Attempt
  #seek?: { target: number; startedAt: number }
  #startedAt: number
  #firstFrameSent = false
  #failedAttemptId?: string
  #ended = false
  #lastStatus: PlaybackState['status'] = 'idle'
  #lastObservedAt: number
  #watchedMs = 0
  #stallStartedAt?: number
  #buffering = false
  #stallCount = 0
  #stallDurationMs = 0
  #lastFrames = 0
  #lastDropped = 0
  #quality: {
    rendered_frames?: number
    dropped_frames?: number
    linear_memory_peak_bytes?: number
    video_queue_peak?: number
    audio_ahead_peak_s?: number
  } = {}

  constructor(
    readonly operationId: string,
    private readonly sink: PlaybackTelemetrySink = defaultSink,
    private readonly now: () => number = () => Date.now(),
    private readonly createId: () => string = () => nanoid(),
    playbackSessionId?: string,
  ) {
    this.playbackSessionId = playbackSessionId ?? beginPlaybackTelemetrySession()
    this.#startedAt = this.now()
    this.#lastObservedAt = this.#startedAt
  }

  beginPrepare(generation: number, engine?: 'native' | 'canvas'): string {
    this.#finishSeek('cancelled')
    this.#attempt?.finishSpan()
    this.#lastFrames = 0
    this.#lastDropped = 0
    const id = this.createId()
    this.#attempt = {
      id,
      generation,
      engine,
      prepareStartedAt: this.now(),
      finishSpan: openSpan(this.sink, {
        name: 'prepare playback source',
        op: 'player.prepare',
        attributes: { operation_id: this.operationId, attempt_id: id, generation },
      }),
    }
    this.sink.breadcrumb('prepare_started', {
      operation_id: this.operationId,
      attempt_id: id,
      generation,
    })
    return id
  }

  /** 新内核以实际呈现回执记录首帧，不能把 play 事件当作画面证据。 */
  completeEnginePrepare(attemptId: string, presentation: MediaPresentation, reason: string) {
    const attempt = this.#attempt
    if (
      !attempt ||
      attempt.id !== attemptId ||
      this.#ended ||
      attempt.completed ||
      !presentation.firstFrame
    )
      return false
    attempt.completed = true
    attempt.finishSpan()
    this.sink.capture('media_prepare_completed', {
      operation_id: this.operationId,
      attempt_id: attempt.id,
      engine: presentation.engine,
      backend: presentation.backend,
      reason,
      duration_ms: this.now() - attempt.prepareStartedAt,
    })
    if (!this.#firstFrameSent) {
      this.#firstFrameSent = true
      this.sink.capture('playback_started', {
        operation_id: this.operationId,
        attempt_id: attempt.id,
        engine: presentation.engine,
        backend: presentation.backend,
        time_to_first_frame_ms: this.now() - this.#startedAt,
      })
    }
    return true
  }

  engineChanged(
    details: Omit<TelemetryEventMap['playback_engine_changed'], 'operation_id' | 'attempt_id'>,
  ) {
    if (!this.#ended)
      this.sink.capture('playback_engine_changed', {
        operation_id: this.operationId,
        attempt_id: this.#attempt?.id,
        ...details,
      })
  }

  observePresentation(info: MediaPresentation | undefined) {
    if (!info || this.#ended) return
    if (info.renderedFrames !== undefined) {
      this.#quality.rendered_frames =
        (this.#quality.rendered_frames ?? 0) + Math.max(0, info.renderedFrames - this.#lastFrames)
      this.#lastFrames = info.renderedFrames
    }
    if (info.droppedFrames !== undefined) {
      this.#quality.dropped_frames =
        (this.#quality.dropped_frames ?? 0) + Math.max(0, info.droppedFrames - this.#lastDropped)
      this.#lastDropped = info.droppedFrames
    }
    if (info.peakLinearMemoryBytes !== undefined)
      this.#quality.linear_memory_peak_bytes = Math.max(
        this.#quality.linear_memory_peak_bytes ?? 0,
        info.peakLinearMemoryBytes,
      )
    if (info.videoQueuePeak !== undefined)
      this.#quality.video_queue_peak = Math.max(
        this.#quality.video_queue_peak ?? 0,
        info.videoQueuePeak,
      )
    if (info.audioAheadPeak !== undefined)
      this.#quality.audio_ahead_peak_s = Math.max(
        this.#quality.audio_ahead_peak_s ?? 0,
        info.audioAheadPeak,
      )
  }

  observe(state: PlaybackState) {
    if (this.#ended) return
    const at = this.now()
    if (this.#lastStatus === 'playing' && !this.#buffering)
      this.#watchedMs += Math.max(0, at - this.#lastObservedAt)
    this.#lastObservedAt = at

    if (state.status === 'seeking' && (!this.#seek || state.targetTime !== this.#seek.target)) {
      this.#finishSeek('cancelled')
      this.#seek = { target: state.targetTime, startedAt: at }
      this.sink.breadcrumb('seek', {
        operation_id: this.operationId,
        target_time: state.targetTime,
        attempt_id: this.#attempt?.id,
      })
      this.#finishStall(false)
    }

    if (this.#seek && state.status !== 'seeking') {
      this.#finishSeek(
        state.status === 'error'
          ? 'failed'
          : state.status === 'playing' || state.status === 'paused' || state.status === 'ended'
            ? 'success'
            : 'cancelled',
      )
    }
    if (state.status === 'playing' && this.#lastStatus !== 'playing') this.onPlaying()

    this.#lastStatus = state.status
    if (state.status === 'ended') this.finish('ended')
  }

  onWaiting() {
    if (this.#ended || this.#lastStatus === 'seeking' || this.#stallStartedAt !== undefined) return
    const at = this.now()
    if (this.#lastStatus === 'playing' && !this.#buffering)
      this.#watchedMs += Math.max(0, at - this.#lastObservedAt)
    this.#lastObservedAt = at
    this.#buffering = true
    this.#stallStartedAt = at
  }

  onPlaying() {
    this.#finishStall(true)
    this.#buffering = false
    this.#lastObservedAt = this.now()
  }

  /** 可重试 attempt 失败不结束整次观看，用户重试仍沿用同一逻辑会话。 */
  failAttempt(errorCode: string) {
    const id = this.#attempt?.id ?? 'prepare'
    if (this.#ended || this.#failedAttemptId === id) return
    this.#failedAttemptId = id
    this.#attempt?.finishSpan()
    this.sink.capture('playback_failed', {
      operation_id: this.operationId,
      attempt_id: this.#attempt?.id,
      engine: this.#attempt?.engine,
      error_code: errorCode,
    })
  }

  finish(reason: TelemetryEventMap['playback_ended']['reason']) {
    if (this.#ended) return
    const at = this.now()
    if (this.#lastStatus === 'playing' && !this.#buffering)
      this.#watchedMs += Math.max(0, at - this.#lastObservedAt)
    this.#finishSeek('cancelled')
    this.#finishStall(false)
    this.sink.capture('playback_ended', {
      operation_id: this.operationId,
      reason,
      ...this.#quality,
      watched_ms: Math.round(this.#watchedMs),
      stall_count: this.#stallCount,
      stall_duration_ms: Math.round(this.#stallDurationMs),
    })
    this.#end()
  }

  #finishSeek(result: TelemetryEventMap['playback_seek_completed']['result']) {
    const seek = this.#seek
    if (!seek) return
    this.#seek = undefined
    this.sink.capture('playback_seek_completed', {
      operation_id: this.operationId,
      attempt_id: this.#attempt?.id,
      engine: this.#attempt?.engine,
      target_time: seek.target,
      duration_ms: Math.max(0, this.now() - seek.startedAt),
      result,
    })
  }

  #finishStall(recovered: boolean) {
    if (this.#stallStartedAt === undefined) return
    const duration = Math.max(0, this.now() - this.#stallStartedAt)
    this.#stallStartedAt = undefined
    if (duration < SIGNIFICANT_STALL_MS) return
    this.#stallCount += 1
    this.#stallDurationMs += duration
    this.sink.capture('playback_stalled', {
      operation_id: this.operationId,
      stall_count: this.#stallCount,
      stall_duration_ms: duration,
      recovered,
    })
  }

  #end() {
    this.#attempt?.finishSpan()
    this.#ended = true
    endPlaybackTelemetrySession(this.playbackSessionId)
  }
}
