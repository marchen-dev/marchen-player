import type { MediaCompatError } from '@marchen/shared/media'
import { FfmpegExecutionError } from '../ffmpeg/executor'

const STDERR_TAIL_LIMIT = 8 * 1024

export class MediaPipelineError extends Error {
  constructor(readonly detail: MediaCompatError) {
    super(detail.message)
    this.name = 'MediaPipelineError'
  }
}

const hasMediaCompatDetail = (error: unknown): error is { detail: MediaCompatError } =>
  typeof error === 'object' &&
  error !== null &&
  'detail' in error &&
  typeof error.detail === 'object' &&
  error.detail !== null &&
  'code' in error.detail &&
  'message' in error.detail

export const toMediaCompatError = (
  cause: unknown,
  fallback: MediaCompatError,
): MediaCompatError => {
  if (cause instanceof AggregateError && cause.errors.length > 0) {
    return toMediaCompatError(cause.errors.at(-1), fallback)
  }
  if (hasMediaCompatDetail(cause)) {
    return {
      ...cause.detail,
      profile: cause.detail.profile ?? fallback.profile,
      attemptChain: cause.detail.attemptChain ?? fallback.attemptChain,
    }
  }
  if (cause instanceof FfmpegExecutionError) {
    return {
      ...fallback,
      cause: cause.message,
      exitCode: cause.code ?? undefined,
      stderrTail: cause.stderr ? cause.stderr.slice(-STDERR_TAIL_LIMIT) : undefined,
    }
  }
  return {
    ...fallback,
    cause: cause instanceof Error ? cause.message : String(cause),
  }
}
