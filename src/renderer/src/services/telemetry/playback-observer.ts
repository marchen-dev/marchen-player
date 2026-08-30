import type { PlaybackState } from '@marchen/playback-core'
import type { PlaybackMode, PlaybackSourceLeaseDescriptor } from '@marchen/shared/media'
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
  mode?: PlaybackMode
  leaseGeneration?: number
  finishSpan: () => void
}

const openSpan = (sink: PlaybackTelemetrySink, span: TelemetrySpan) => {
  let finish = () => {}
  sink.startSpan(span, () => new Promise<void>((resolve) => void (finish = resolve)))
  return () => finish()
}

export const inferPlaybackPlanReason = (
  mode: PlaybackMode,
  fallback = false,
): TelemetryEventMap['media_prepare_completed']['reason'] => {
  if (fallback) return 'native-decode-failed'
  switch (mode) {
    case 'direct':
      return 'native-compatible'
    case 'remux':
      return 'container-incompatible'
    case 'transcode-audio':
      return 'audio-incompatible'
    case 'transcode-video':
      return 'video-incompatible'
  }
}

/** Renderer runtime 的单个逻辑媒体会话汇总器；不接收路径、URL、token 或原始错误对象。 */
export class PlaybackTelemetryObserver {
  readonly playbackSessionId: string

  #attempt?: Attempt
  #startedAt: number
  #firstFrameSent = false
  #ended = false
  #lastStatus: PlaybackState['status'] = 'idle'
  #lastObservedAt: number
  #watchedMs = 0
  #stallStartedAt?: number
  #buffering = false
  #stallCount = 0
  #stallDurationMs = 0

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

  beginPrepare(generation: number): string {
    this.#attempt?.finishSpan()
    const id = this.createId()
    this.#attempt = {
      id,
      generation,
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

  completePrepare(
    attemptId: string,
    lease: PlaybackSourceLeaseDescriptor,
    options?: { fallback?: boolean; container?: string; videoCodec?: string; audioCodec?: string },
  ) {
    const attempt = this.#attempt
    if (!attempt || attempt.id !== attemptId || this.#ended) return false
    attempt.mode = lease.mode
    attempt.leaseGeneration = lease.generation
    attempt.finishSpan()
    this.sink.capture('media_prepare_completed', {
      operation_id: this.operationId,
      attempt_id: attempt.id,
      mode: lease.mode,
      reason: inferPlaybackPlanReason(lease.mode, options?.fallback),
      duration_ms: this.now() - attempt.prepareStartedAt,
      generation: lease.generation,
      container: options?.container,
      video_codec: options?.videoCodec,
      audio_codec: options?.audioCodec,
    })
    this.sink.breadcrumb('first_resource_ready', {
      operation_id: this.operationId,
      attempt_id: attempt.id,
      mode: lease.mode,
      generation: lease.generation,
    })
    return true
  }

  beginFallback(from: PlaybackMode, to: PlaybackMode): string {
    const attemptId = this.beginPrepare((this.#attempt?.generation ?? 0) + 1)
    this.sink.capture('compat_fallback_triggered', {
      operation_id: this.operationId,
      attempt_id: attemptId,
      from,
      to,
      reason: 'native-decode-failed',
    })
    return attemptId
  }

  observe(state: PlaybackState) {
    if (this.#ended) return
    const at = this.now()
    if (this.#lastStatus === 'playing' && !this.#buffering)
      this.#watchedMs += Math.max(0, at - this.#lastObservedAt)
    this.#lastObservedAt = at

    if (state.status === 'seeking' && this.#lastStatus !== 'seeking') {
      this.sink.breadcrumb('seek', {
        operation_id: this.operationId,
        target_time: state.targetTime,
        generation: this.#attempt?.leaseGeneration,
      })
      this.#finishStall(false)
    }

    if (state.status === 'playing') {
      this.onPlaying()
      if (!this.#firstFrameSent && this.#attempt?.mode) {
        this.#firstFrameSent = true
        this.sink.capture('playback_started', {
          operation_id: this.operationId,
          attempt_id: this.#attempt.id,
          mode: this.#attempt.mode,
          time_to_first_frame_ms: at - this.#startedAt,
          generation: this.#attempt.leaseGeneration,
        })
      }
    }

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

  fail(errorCode: string) {
    if (this.#ended) return
    this.sink.capture('playback_failed', {
      operation_id: this.operationId,
      error_code: errorCode,
      mode: this.#attempt?.mode,
      generation: this.#attempt?.leaseGeneration,
    })
    this.#end()
  }

  finish(reason: TelemetryEventMap['playback_ended']['reason']) {
    if (this.#ended) return
    const at = this.now()
    if (this.#lastStatus === 'playing' && !this.#buffering)
      this.#watchedMs += Math.max(0, at - this.#lastObservedAt)
    this.#finishStall(false)
    this.sink.capture('playback_ended', {
      operation_id: this.operationId,
      reason,
      watched_ms: Math.round(this.#watchedMs),
      stall_count: this.#stallCount,
      stall_duration_ms: Math.round(this.#stallDurationMs),
    })
    this.#end()
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
