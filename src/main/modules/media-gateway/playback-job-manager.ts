import type {
  MediaCompatError,
  PipelineFingerprint,
  PipelineRuntimeChoice,
  PlaybackJobCoverage,
  PlaybackJobPhase,
  PlaybackJobSnapshot,
  SegmentStoreSnapshot,
} from '@marchen/shared/media'
import { toPublicMediaCompatError } from '@marchen/shared/media'
import type { FfmpegProgressRecord } from '../ffmpeg/executor'

export interface PlaybackJobManagerOptions {
  id: string
  sessionId: string
  pipeline: PipelineFingerprint
  runtime: PipelineRuntimeChoice
  coverage: PlaybackJobCoverage
  requestedStartTime: number
  audioOutput?: PlaybackJobSnapshot['audioOutput']
}

export type PlaybackJobListener = (snapshot: PlaybackJobSnapshot) => void

const ACTIVE_PHASES = new Set<PlaybackJobPhase>(['starting', 'producing', 'throttled', 'stopping'])

const progressSeconds = (record: Readonly<FfmpegProgressRecord>): number | undefined => {
  for (const key of ['out_time_us', 'out_time_ms']) {
    const value = Number(record[key])
    if (Number.isFinite(value) && value >= 0) return value / 1_000_000
  }
  return undefined
}

const progressSpeed = (record: Readonly<FfmpegProgressRecord>): number | undefined => {
  const value = Number(record.speed?.replace(/x$/i, ''))
  return Number.isFinite(value) && value >= 0 ? value : undefined
}

/**
 * 一个 FFmpeg Playback Job 的证据状态机。
 *
 * Manager 不根据计时器猜测进程状态：调用方只能在已观察到调度、产出、
 * 节流、退出或错误证据后调用对应方法。这样诊断快照不会把“已请求”误报为“已完成”。
 */
export class PlaybackJobManager {
  readonly #listeners = new Set<PlaybackJobListener>()
  #snapshot: PlaybackJobSnapshot

  constructor(options: PlaybackJobManagerOptions) {
    this.#snapshot = {
      id: options.id,
      sessionId: options.sessionId,
      phase: 'idle',
      pipeline: { ...options.pipeline },
      runtime: structuredClone(options.runtime),
      coverage: { ...options.coverage },
      requestedStartTime: options.requestedStartTime,
      audioOutput: options.audioOutput ? { ...options.audioOutput } : undefined,
      activeRequestCount: 0,
      waiterCount: 0,
    }
  }

  get snapshot(): PlaybackJobSnapshot {
    return structuredClone(this.#snapshot)
  }

  subscribe(listener: PlaybackJobListener): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  requestStart(): PlaybackJobSnapshot {
    this.#transition('starting', ['idle'])
    return this.snapshot
  }

  reportProducingEvidence(startedAt = Date.now()): PlaybackJobSnapshot {
    this.#transition('producing', ['starting'], { startedAt })
    return this.snapshot
  }

  reportCoverageEvidence(input: {
    coverage: PlaybackJobCoverage
    actualFirstPts?: number
  }): PlaybackJobSnapshot {
    if (this.#snapshot.phase !== 'producing' && this.#snapshot.phase !== 'throttled') {
      throw new Error(`Playback Job 不能在 ${this.#snapshot.phase} 记录覆盖证据`)
    }
    if (
      !Number.isSafeInteger(input.coverage.startSegment) ||
      input.coverage.startSegment < 0 ||
      (input.coverage.endSegment !== undefined &&
        (!Number.isSafeInteger(input.coverage.endSegment) ||
          input.coverage.endSegment < input.coverage.startSegment))
    ) {
      throw new RangeError('Playback Job coverage 无效')
    }
    if (input.actualFirstPts !== undefined && !Number.isFinite(input.actualFirstPts)) {
      throw new RangeError('Playback Job 实际首 PTS 无效')
    }
    this.#snapshot = {
      ...this.#snapshot,
      coverage: { ...input.coverage },
      actualFirstPts: input.actualFirstPts ?? this.#snapshot.actualFirstPts,
    }
    this.#emit()
    return this.snapshot
  }

  reportActivityEvidence(
    store: SegmentStoreSnapshot,
    heartbeatAt = Date.now(),
  ): PlaybackJobSnapshot {
    if (!ACTIVE_PHASES.has(this.#snapshot.phase)) {
      throw new Error(`Playback Job 不能在 ${this.#snapshot.phase} 记录活动证据`)
    }
    if (!Number.isFinite(heartbeatAt) || heartbeatAt < (this.#snapshot.lastHeartbeatAt ?? 0)) {
      throw new RangeError('Playback Job heartbeat 时间无效或倒退')
    }
    this.#snapshot = {
      ...this.#snapshot,
      ...this.#activityPatch(store),
      lastHeartbeatAt: heartbeatAt,
    }
    this.#emit()
    return this.snapshot
  }

  reportProgressEvidence(
    record: Readonly<FfmpegProgressRecord>,
    store: SegmentStoreSnapshot,
    heartbeatAt = Date.now(),
    progressIsLogical = false,
  ): PlaybackJobSnapshot {
    if (this.#snapshot.phase !== 'producing' && this.#snapshot.phase !== 'throttled') {
      throw new Error(`Playback Job 不能在 ${this.#snapshot.phase} 记录进度证据`)
    }
    if (!Number.isFinite(heartbeatAt) || heartbeatAt < (this.#snapshot.lastProgressAt ?? 0)) {
      throw new RangeError('Playback Job heartbeat 时间无效或倒退')
    }
    const outputSeconds = progressSeconds(record)
    const progressPosition =
      outputSeconds === undefined
        ? undefined
        : (progressIsLogical ? 0 : this.#snapshot.requestedStartTime) + outputSeconds
    const activity = this.#activityPatch(store)
    const productionPosition = Math.max(
      progressPosition ?? 0,
      activity.productionPosition ?? 0,
      this.#snapshot.productionPosition ?? 0,
    )
    const consumptionPosition = activity.consumptionPosition
    this.#snapshot = {
      ...this.#snapshot,
      ...activity,
      productionPosition,
      aheadDuration:
        consumptionPosition === undefined
          ? undefined
          : Math.max(
              0,
              (store.continuousPublishedEnd ?? consumptionPosition) - consumptionPosition,
            ),
      processingSpeed: progressSpeed(record) ?? this.#snapshot.processingSpeed,
      lastProgressAt: heartbeatAt,
    }
    this.#emit()
    return this.snapshot
  }

  /** 轮询更新引用数，不把服务器自身轮询记作客户端心跳。 */
  reportStoreEvidence(store: SegmentStoreSnapshot): void {
    this.#snapshot = {
      ...this.#snapshot,
      ...this.#activityPatch(store),
      aheadDuration:
        store.consumptionPosition === undefined
          ? undefined
          : Math.max(
              0,
              (store.continuousPublishedEnd ?? store.consumptionPosition) -
                store.consumptionPosition,
            ),
      lastHeartbeatAt:
        Math.max(this.#snapshot.lastHeartbeatAt ?? 0, store.lastClientActivityAt ?? 0) || undefined,
    }
    this.#emit()
  }

  reportThrottledEvidence(): PlaybackJobSnapshot {
    this.#transition('throttled', ['producing'])
    return this.snapshot
  }

  reportResumedEvidence(): PlaybackJobSnapshot {
    this.#transition('producing', ['throttled'])
    return this.snapshot
  }

  requestStop(): PlaybackJobSnapshot {
    if (this.#snapshot.phase === 'stopping') return this.snapshot
    this.#transition('stopping', ['starting', 'producing', 'throttled'])
    return this.snapshot
  }

  reportStoppedEvidence(
    input: { stoppedAt?: number; exitCode?: number } = {},
  ): PlaybackJobSnapshot {
    this.#transition('stopped', ['starting', 'producing', 'throttled', 'stopping'], {
      stoppedAt: input.stoppedAt ?? Date.now(),
      exitCode: input.exitCode,
    })
    return this.snapshot
  }

  reportFailure(error: MediaCompatError): PlaybackJobSnapshot {
    if (!ACTIVE_PHASES.has(this.#snapshot.phase)) {
      throw new Error(`Playback Job 不能从 ${this.#snapshot.phase} 进入 failed`)
    }
    this.#transition('failed', [...ACTIVE_PHASES], {
      stoppedAt: Date.now(),
      exitCode: error.exitCode,
      error: toPublicMediaCompatError(error),
    })
    return this.snapshot
  }

  #transition(
    next: PlaybackJobPhase,
    allowed: readonly PlaybackJobPhase[],
    patch: Partial<PlaybackJobSnapshot> = {},
  ): void {
    if (!allowed.includes(this.#snapshot.phase)) {
      throw new Error(`Playback Job 不能从 ${this.#snapshot.phase} 进入 ${next}`)
    }
    this.#snapshot = { ...this.#snapshot, ...patch, phase: next }
    this.#emit()
  }

  #emit(): void {
    const snapshot = this.snapshot
    for (const listener of this.#listeners) listener(snapshot)
  }

  #activityPatch(
    store: SegmentStoreSnapshot,
  ): Pick<
    PlaybackJobSnapshot,
    'activeRequestCount' | 'waiterCount' | 'productionPosition' | 'consumptionPosition'
  > {
    const { startSegment, endSegment } = this.#snapshot.coverage
    const publishedPosition = store.entries
      .filter(
        (entry) =>
          entry.status === 'published' &&
          entry.index >= startSegment &&
          (endSegment === undefined || entry.index <= endSegment),
      )
      .reduce<number | undefined>(
        (current, entry) => Math.max(current ?? entry.endTime, entry.endTime),
        undefined,
      )
    return {
      activeRequestCount:
        store.initActiveRequestCount +
        store.entries.reduce((total, entry) => total + entry.activeRequestCount, 0),
      waiterCount:
        store.initWaiterCount +
        store.entries.reduce((total, entry) => total + entry.waiterCount, 0),
      productionPosition: publishedPosition ?? this.#snapshot.productionPosition,
      consumptionPosition: store.consumptionPosition,
    }
  }
}
