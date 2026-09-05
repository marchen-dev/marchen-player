export const MEDIA_COMPAT_ERROR_CODES = [
  'source-unavailable',
  'source-changed',
  'probe-failed',
  'probe-timeout',
  'runtime-unavailable',
  'runtime-capability-missing',
  'ffmpeg-decoder-unavailable',
  'ffmpeg-encoder-unavailable',
  'ffmpeg-filter-unavailable',
  'ffmpeg-format-unavailable',
  'unsupported-container',
  'unsupported-video',
  'video-range-not-supported',
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
  'hls-timeline-unavailable',
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

export const MEDIA_PREPARATION_STAGES = [
  'profile',
  'probe',
  'keyframe',
  'preflight',
  'job',
  'segment',
  'mse',
  'first-frame',
] as const

export type MediaPreparationStage = (typeof MEDIA_PREPARATION_STAGES)[number]

export interface MediaCompatError {
  code: MediaCompatErrorCode
  message: string
  recoverable: boolean
  cause?: string
  stage?: MediaCompatErrorStage
  deadlineStage?: MediaPreparationStage
  exitCode?: number
  /** 只允许携带执行器已经截断的 stderr 尾部。 */
  stderrTail?: string
  profile?: import('./plan').OutputProfileKind
  attemptChain?: import('./plan').OutputProfileKind[]
  compatibilityReason?: import('./compatibility-reason').CompatibilityReason
}

export const isMediaCompatErrorCode = (value: string): value is MediaCompatErrorCode =>
  (MEDIA_COMPAT_ERROR_CODES as readonly string[]).includes(value)

const redactErrorText = (value: string | undefined): string | undefined =>
  value
    ?.replace(/(\/v\d+\/media\/)[^/\s"']+/gi, '$1<token>')
    .replace(/\b[A-Za-z]:\\(?:[^\s"']+\\)*[^\s"']+/g, '<local-path>')
    .replace(/\/(?:Users|Volumes|private|var|tmp)\/(?:[^\s"']+\/?)+/g, '<local-path>')

const PUBLIC_STDERR_TAIL_LIMIT = 8 * 1024

/** IPC/诊断安全副本：保留阶段证据和有界 stderr，但移除 token 与常见绝对路径。 */
export const toPublicMediaCompatError = (error: MediaCompatError): MediaCompatError => ({
  ...error,
  message: redactErrorText(error.message) ?? '媒体兼容处理失败',
  cause: redactErrorText(error.cause),
  stderrTail: redactErrorText(error.stderrTail?.slice(-PUBLIC_STDERR_TAIL_LIMIT)),
  attemptChain: error.attemptChain ? [...error.attemptChain] : undefined,
  compatibilityReason: error.compatibilityReason ? { ...error.compatibilityReason } : undefined,
})
