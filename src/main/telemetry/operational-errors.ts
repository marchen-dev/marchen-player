import type { OperationalArea } from '@marchen/shared/telemetry/errors'
import { normalizeOperationalError } from '@marchen/shared/telemetry/errors'
import * as Sentry from '@sentry/electron/main'
import { getMainErrorDiagnosticContext } from './diagnostics'

export const reportMainOperationalError = (
  area: OperationalArea,
  operation: string,
  error: unknown,
  recovered = false,
): void => {
  const normalized = normalizeOperationalError(area, error)
  const attributes = {
    area,
    operation,
    error_code: normalized.errorCode,
    recovered,
  }
  Sentry.addBreadcrumb({
    category: `operational.${area}`,
    message: operation,
    level: recovered || normalized.expected ? 'warning' : 'error',
    data: attributes,
  })

  if (recovered || normalized.expected) {
    Sentry.logger.warn(normalized.message, attributes)
    return
  }

  Sentry.withScope((scope) => {
    scope.setFingerprint(normalized.fingerprint)
    scope.setTag('error_code', normalized.errorCode)
    scope.setContext('operation', attributes)
    const diagnostics = getMainErrorDiagnosticContext(error)
    if (Object.keys(diagnostics).length > 0) scope.setContext('diagnostics', diagnostics)
    Sentry.captureException(error, { mechanism: { type: `${area}.${operation}`, handled: true } })
  })
}
