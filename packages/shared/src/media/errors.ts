export const MEDIA_COMPAT_ERROR_CODES = [
  'source-unavailable',
  'source-changed',
  'probe-failed',
  'probe-timeout',
  'runtime-unavailable',
  'runtime-capability-missing',
  'unsupported-container',
  'unsupported-video',
  'unsupported-audio',
  'tone-map-unavailable',
  'session-not-found',
  'session-expired',
  'generation-failed',
  'disk-space-low',
  'cache-budget-exceeded',
  'cancelled',
  'gateway-unavailable',
  'gateway-access-denied',
  'encoder-check-failed',
  'pipeline-preflight-failed',
  'manifest-invalid',
  'mse-attach-failed',
  'metadata-invalid',
  'decode-failed',
  'startup-deadline-exceeded',
  'unknown',
] as const

export type MediaCompatErrorCode = (typeof MEDIA_COMPAT_ERROR_CODES)[number]

export const MEDIA_COMPAT_ERROR_STAGES = [
  'probe',
  'planning',
  'encoder-check',
  'pipeline-preflight',
  'transcode',
  'manifest-validation',
  'gateway',
  'mse',
  'metadata',
  'decode',
  'cleanup',
] as const

export type MediaCompatErrorStage = (typeof MEDIA_COMPAT_ERROR_STAGES)[number]

export interface MediaCompatError {
  code: MediaCompatErrorCode
  message: string
  recoverable: boolean
  cause?: string
  stage?: MediaCompatErrorStage
  exitCode?: number
  /** 只允许携带执行器已经截断的 stderr 尾部。 */
  stderrTail?: string
  profile?: import('./plan').OutputProfileKind
  attemptChain?: import('./plan').OutputProfileKind[]
}

export const isMediaCompatErrorCode = (value: string): value is MediaCompatErrorCode =>
  (MEDIA_COMPAT_ERROR_CODES as readonly string[]).includes(value)
