import { FfmpegExecutionError, type FfmpegExecution } from '../ffmpeg/executor'
import type { SegmentStoreSnapshot } from '@marchen/shared/media'
import { toMediaCompatError } from './errors'
import { PlaybackJobManager } from './playback-job-manager'

export interface PlaybackPauseResumeControl {
  /** 只有平台已验证进程确实进入暂停态时才返回 true。 */
  pause: () => Promise<boolean>
  /** 只有平台已验证进程恢复产出时才返回 true。 */
  resume: () => Promise<boolean>
}

export interface PlaybackAheadWindowControllerOptions {
  manager: PlaybackJobManager
  execution: Pick<FfmpegExecution, 'result' | 'stop'>
  pauseResume?: PlaybackPauseResumeControl
  resumeAheadSeconds?: number
  throttleAheadSeconds?: number
  hardAheadSeconds?: number
}

export type AheadWindowAction =
  | { kind: 'none' }
  | { kind: 'throttled' }
  | { kind: 'resumed' }
  | { kind: 'stopped'; resumeFromSegment?: number }

const nextUnpublishedSegment = (store: SegmentStoreSnapshot): number | undefined =>
  store.entries.find(
    (entry) =>
      entry.endTime > (store.continuousPublishedEnd ?? store.consumptionPosition ?? 0) &&
      (entry.status === 'missing' || entry.status === 'evicted' || entry.status === 'failed'),
  )?.index

/** 将无界 FFmpeg 生产限制在当前 HLS 消费位置之前的可控窗口内。 */
export class PlaybackAheadWindowController {
  #stopPromise?: Promise<AheadWindowAction>

  constructor(private readonly options: PlaybackAheadWindowControllerOptions) {}

  async evaluate(store: SegmentStoreSnapshot): Promise<AheadWindowAction> {
    if (this.#stopPromise) return this.#stopPromise
    const snapshot = this.options.manager.snapshot
    const ahead = snapshot.aheadDuration
    if (ahead === undefined) return { kind: 'none' }
    const resumeAt = this.options.resumeAheadSeconds ?? 20
    const throttleAt = this.options.throttleAheadSeconds ?? 60
    const hardAt = this.options.hardAheadSeconds ?? 90

    if (snapshot.phase === 'throttled' && ahead <= resumeAt) {
      if (await this.options.pauseResume?.resume()) {
        this.options.manager.reportResumedEvidence()
        return { kind: 'resumed' }
      }
      return this.#stop(store)
    }
    if (snapshot.phase !== 'producing' || ahead < throttleAt) return { kind: 'none' }
    if (ahead < hardAt && (await this.options.pauseResume?.pause())) {
      this.options.manager.reportThrottledEvidence()
      return { kind: 'throttled' }
    }
    return this.#stop(store)
  }

  #stop(store: SegmentStoreSnapshot): Promise<AheadWindowAction> {
    this.#stopPromise ??= this.#stopForWindow(store)
    return this.#stopPromise
  }

  async #stopForWindow(store: SegmentStoreSnapshot): Promise<AheadWindowAction> {
    this.options.manager.requestStop()
    this.options.execution.stop()
    try {
      const result = await this.options.execution.result
      this.options.manager.reportStoppedEvidence({ exitCode: result.code })
    } catch (cause) {
      if (cause instanceof FfmpegExecutionError && cause.failure === 'cancelled') {
        // 主动停止允许通过 AbortController 收尾，close 已发生，不应报生产失败。
        this.options.manager.reportStoppedEvidence({ exitCode: cause.code ?? undefined })
      } else
        this.options.manager.reportFailure(
          toMediaCompatError(cause, {
            code: 'generation-failed',
            stage: 'transcode',
            message: 'Playback Job ahead window 停止失败',
            recoverable: true,
          }),
        )
    }
    return { kind: 'stopped', resumeFromSegment: nextUnpublishedSegment(store) }
  }
}
