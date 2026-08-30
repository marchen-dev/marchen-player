import type { OperationalArea } from '@marchen/shared/telemetry/errors'
import { normalizeOperationalError } from '@marchen/shared/telemetry/errors'

import { telemetry } from './client'

export const reportOperationalError = (
  area: OperationalArea,
  operation: string,
  error: unknown,
  recovered = false,
): void => {
  const normalized = normalizeOperationalError(area, error)
  const data = { area, operation, error_code: normalized.errorCode, recovered }
  telemetry.addBreadcrumb({
    category: `operational.${area}`,
    message: operation,
    level: recovered || normalized.expected ? 'warning' : 'error',
    data,
  })

  if (recovered || normalized.expected) {
    telemetry.log({ level: 'warning', message: normalized.message, data })
    return
  }
  telemetry.captureException(error, {
    handled: true,
    mechanism: `${area}.${operation}`,
    errorCode: normalized.errorCode,
    fingerprint: normalized.fingerprint,
    contexts: { operation: data },
  })
}
