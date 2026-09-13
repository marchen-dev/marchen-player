import type { TelemetryClient } from '../contracts'

import * as Sentry from '@sentry/react'
import { sanitizeTelemetryValue } from '../sanitize'

export const createSentryTelemetryClient = (): TelemetryClient => ({
  identify(identity) {
    Sentry.setUser({ id: identity.installId })
    Sentry.setTags({
      install_id: identity.installId,
      app_session_id: identity.appSessionId,
    })
  },
  capture(name, properties) {
    // 产品事件由 PostHog 负责；Sentry 仅保留最近的稳定业务状态作为 breadcrumb。
    Sentry.addBreadcrumb({ category: 'product', message: name, data: properties, level: 'info' })
  },
  captureException(error, context) {
    return Sentry.withScope((scope) => {
      if (context?.fingerprint) scope.setFingerprint(context.fingerprint)
      if (context?.level) scope.setLevel(context.level)
      if (context?.errorCode) scope.setTag('error_code', context.errorCode)
      if (context?.mechanism) scope.setTag('mechanism', context.mechanism)
      if (typeof context?.handled === 'boolean') scope.setTag('handled', context.handled)
      if (context?.contexts) {
        const sanitized = sanitizeTelemetryValue(context.contexts)
        scope.setContext('diagnostics', sanitized.value as Record<string, unknown>)
      }
      return Sentry.captureException(error, {
        mechanism: {
          type: context?.mechanism ?? 'telemetry.explicit',
          handled: context?.handled ?? true,
        },
      })
    })
  },
  log(entry) {
    const sanitized = sanitizeTelemetryValue(entry.data)
    const attributes = sanitized.value as Record<string, string | number | boolean | null>
    const level = entry.level === 'warning' ? 'warn' : entry.level
    Sentry.logger[level](entry.message, attributes)
  },
  addBreadcrumb(breadcrumb) {
    const sanitized = sanitizeTelemetryValue(breadcrumb.data)
    Sentry.addBreadcrumb({ ...breadcrumb, data: sanitized.value as Record<string, unknown> })
  },
  startSpan(span, run) {
    return Sentry.startSpan(
      { name: span.name, op: span.op, attributes: span.attributes },
      () => run(),
    )
  },
  async flush() {
    await Sentry.flush(2_000)
  },
  async reset() {
    Sentry.setUser(null)
    Sentry.setTag('install_id', undefined)
  },
})
