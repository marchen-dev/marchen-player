import type { OperationalArea } from '@marchen/shared/telemetry/errors'
import { writeLog } from '@main/lib/diagnostic-log'
import { normalizeOperationalError } from '@marchen/shared/telemetry/errors'
import * as Sentry from '@sentry/electron/main'

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
  // 本地日志不受遥测开关影响：离线或未配置 Sentry 时仍能事后排查
  writeLog({
    lv: recovered || normalized.expected ? 'warn' : 'error',
    cat: area,
    msg: operation,
    data: { ...attributes, message: normalized.message, error },
  })
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
    Sentry.captureException(error, { mechanism: { type: `${area}.${operation}`, handled: true } })
  })
}
