export type OperationalArea = 'ffmpeg' | 'gateway' | 'ipc' | 'player'

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

  return {
    area,
    errorCode: code,
    fingerprint: ['operational', area, code],
    expected: expectedCodes.has(String(rawCode).toLowerCase()),
    message:
      error instanceof Error
        ? error.message
        : typeof candidate.message === 'string'
          ? candidate.message
          : String(error ?? 'Unknown error'),
  }
}
