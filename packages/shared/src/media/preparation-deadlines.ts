import type { MediaCompatError, MediaCompatErrorStage, MediaPreparationStage } from './errors'

export const DEFAULT_PREPARATION_DEADLINES_MS: Readonly<Record<MediaPreparationStage, number>> = {
  profile: 2_000,
  probe: 8_000,
  keyframe: 8_000,
  preflight: 8_000,
  job: 3_000,
  // v1 prepare IPC 在返回 session 前还包含 encoder/preflight/job 启动，不能直接套用
  // v2 “Job 已启动后首段 3s”的单阶段门槛。迁移期按 warm prepare 总硬期限 8s。
  segment: 8_000,
  mse: 5_000,
  'first-frame': 5_000,
}

const errorStage = (stage: MediaPreparationStage): MediaCompatErrorStage => {
  if (stage === 'profile') return 'planning'
  if (stage === 'probe') return 'probe'
  if (stage === 'preflight') return 'pipeline-preflight'
  if (stage === 'mse') return 'mse'
  if (stage === 'first-frame') return 'decode'
  if (stage === 'keyframe') return 'metadata'
  return 'transcode'
}

export class PlaybackStageDeadlineError extends Error {
  readonly code = 'startup-deadline-exceeded' as const
  readonly stage: MediaCompatErrorStage
  get detail(): MediaCompatError {
    return {
      code: this.code,
      stage: this.stage,
      deadlineStage: this.deadlineStage,
      message: this.message,
      recoverable: true,
    }
  }

  constructor(
    readonly deadlineStage: MediaPreparationStage,
    readonly deadlineMs: number,
  ) {
    super(`媒体准备阻塞在 ${deadlineStage} 阶段，超过 ${deadlineMs}ms 期限`)
    this.name = 'PlaybackStageDeadlineError'
    this.stage = errorStage(deadlineStage)
  }
}

export const withPlaybackStageDeadline = <T>(
  stage: MediaPreparationStage,
  operation: Promise<T>,
  options: { deadlineMs?: number; signal?: AbortSignal } = {},
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const deadlineMs = options.deadlineMs ?? DEFAULT_PREPARATION_DEADLINES_MS[stage]
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', onAbort)
      callback()
    }
    const onAbort = () =>
      finish(() => reject(options.signal?.reason ?? new Error('媒体准备已取消')))
    const timer = setTimeout(
      () => finish(() => reject(new PlaybackStageDeadlineError(stage, deadlineMs))),
      Math.max(1, deadlineMs),
    )
    options.signal?.addEventListener('abort', onAbort, { once: true })
    operation.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    )
    if (options.signal?.aborted) onAbort()
  })
