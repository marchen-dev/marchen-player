import type { MediaPreparationStage } from '@marchen/shared/media'
import { withPlaybackStageDeadline } from '@marchen/shared/media'
import { MediaPipelineError } from './errors'

export const cancelledPreparation = () =>
  new MediaPipelineError({
    code: 'cancelled',
    stage: 'cleanup',
    message: '媒体准备已取消',
    recoverable: true,
  })

/** 阶段结束即撤销子 signal，超时不会留下仍可发布结果的准备工作。 */
export const runPreparationStage = async <T>(
  stage: MediaPreparationStage,
  run: (signal: AbortSignal) => Promise<T>,
  options: { signal?: AbortSignal; deadlineMs?: number } = {},
): Promise<T> => {
  const controller = new AbortController()
  const abort = () => controller.abort(options.signal?.reason ?? cancelledPreparation())
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) abort()
  try {
    controller.signal.throwIfAborted()
    return await withPlaybackStageDeadline(
      stage,
      Promise.resolve().then(() => run(controller.signal)),
      { ...options, signal: controller.signal },
    )
  } finally {
    options.signal?.removeEventListener('abort', abort)
    controller.abort(cancelledPreparation())
  }
}
