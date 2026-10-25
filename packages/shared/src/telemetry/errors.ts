export type OperationalArea = 'ipc' | 'player'

export interface NormalizedOperationalError {
  area: OperationalArea
  errorCode: string
  fingerprint: string[]
  expected: boolean
  message: string
}

const stablePart = (value: string): string =>
  value
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
    .slice(0, 80) || 'UNKNOWN'

/**
 * 媒体源里由用户环境造成的失败：服务器离线、密码错误、证书、权限、来源被移除等。
 * 它们不是代码缺陷，只记 warning 日志，不作为 Sentry 异常，以免 NAS 关机就刷屏；
 * invalid_response、range_unsupported、invalid_input 更可能是我们的问题，仍按异常上报。
 * 只认 MediaSourceError，避免误伤其他领域里同名的 code。
 */
const MEDIA_SOURCE_ENVIRONMENT_CODES = new Set([
  'auth_failed',
  'forbidden',
  'unreachable',
  'certificate',
  'unsupported_version',
  'not_found',
  'content_changed',
  'source_removed',
])

export const normalizeOperationalError = (
  area: OperationalArea,
  error: unknown,
): NormalizedOperationalError => {
  const candidate = error && typeof error === 'object' ? (error as Record<string, unknown>) : {}
  const rawCode =
    typeof candidate.code === 'string'
      ? candidate.code
      : typeof candidate.failure === 'string'
        ? candidate.failure
        : error instanceof Error
          ? error.name
          : 'unknown'
  const code = `${stablePart(area)}_${stablePart(rawCode)}`
  const expectedCodes = new Set(['cancelled', 'source-changed', 'session-expired', 'aborted'])
  const expected =
    expectedCodes.has(String(rawCode).toLowerCase()) ||
    (candidate.name === 'MediaSourceError' && MEDIA_SOURCE_ENVIRONMENT_CODES.has(String(rawCode)))

  return {
    area,
    errorCode: code,
    fingerprint: ['operational', area, code],
    expected,
    message:
      error instanceof Error
        ? error.message
        : typeof candidate.message === 'string'
          ? candidate.message
          : String(error ?? 'Unknown error'),
  }
}
