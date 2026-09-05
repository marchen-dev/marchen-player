import type { MediaPreparationStage, PlaybackSourceLeaseDescriptor } from '@marchen/shared/media'

export interface SafePlaybackPerformanceSnapshot {
  stageDurationsMs: Partial<Record<MediaPreparationStage, number>>
  firstFrameMs?: number
  seekResumeMs?: number
  job?: {
    phase: string
    productionPosition?: number
    consumptionPosition?: number
    aheadDuration?: number
    processingSpeed?: number
    activeRequestCount: number
    waiterCount: number
  }
  cache?: { publishedBytes: number; publishedSegments: number; evictedSegments: number }
}

/** 只接收阶段时间和脱敏 lease 快照，输出不包含 URL、token、缓存路径或源路径。 */
export class PlaybackPerformanceRecorder {
  readonly #stageDurations = new Map<MediaPreparationStage, number>()
  #firstFrameMs?: number
  #seekResumeMs?: number

  constructor(private readonly now: () => number = () => performance.now()) {}

  beginStage(stage: MediaPreparationStage): () => number {
    const startedAt = this.now()
    let finished: number | undefined
    return () => {
      if (finished !== undefined) return finished
      finished = Math.max(0, this.now() - startedAt)
      this.#stageDurations.set(stage, finished)
      if (stage === 'first-frame') this.#firstFrameMs = finished
      return finished
    }
  }

  beginSeek(): () => number {
    const startedAt = this.now()
    let finished: number | undefined
    return () => {
      if (finished !== undefined) return finished
      finished = Math.max(0, this.now() - startedAt)
      this.#seekResumeMs = finished
      return finished
    }
  }

  snapshot(lease?: PlaybackSourceLeaseDescriptor): SafePlaybackPerformanceSnapshot {
    const job = lease?.job
    const store = lease?.segmentStore
    return {
      stageDurationsMs: Object.fromEntries(this.#stageDurations),
      firstFrameMs: this.#firstFrameMs,
      seekResumeMs: this.#seekResumeMs,
      job: job
        ? {
            phase: job.phase,
            productionPosition: job.productionPosition,
            consumptionPosition: job.consumptionPosition,
            aheadDuration: job.aheadDuration,
            processingSpeed: job.processingSpeed,
            activeRequestCount: job.activeRequestCount,
            waiterCount: job.waiterCount,
          }
        : undefined,
      cache: store
        ? {
            publishedBytes: store.publishedBytes,
            publishedSegments: store.entries.filter((entry) => entry.status === 'published').length,
            evictedSegments: store.entries.filter((entry) => entry.status === 'evicted').length,
          }
        : undefined,
    }
  }
}
