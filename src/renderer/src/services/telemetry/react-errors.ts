import type { ErrorInfo } from 'react'

import type { ErrorContext } from './contracts'
import { telemetry } from './client'
import { captureExceptionOnce } from './error-dedupe'

type Capture = (error: unknown, context: ErrorContext) => string | undefined

export const createReactRootErrorHandlers = (
  capture: Capture = telemetry.captureException,
) => {
  const report = (
    error: unknown,
    errorInfo: ErrorInfo,
    context: Pick<ErrorContext, 'handled' | 'mechanism' | 'level'>,
  ) =>
    captureExceptionOnce(error, {
      ...context,
      contexts: {
        react: { component_stack: errorInfo.componentStack ?? '' },
      },
    }, capture)

  return {
    onUncaughtError: (error: unknown, errorInfo: ErrorInfo) =>
      report(error, errorInfo, {
        handled: false,
        mechanism: 'react.uncaught',
        level: 'fatal',
      }),
    onCaughtError: (error: unknown, errorInfo: ErrorInfo) =>
      report(error, errorInfo, {
        handled: true,
        mechanism: 'react.caught',
        level: 'error',
      }),
    onRecoverableError: (error: unknown, errorInfo: ErrorInfo) =>
      report(error, errorInfo, {
        handled: true,
        mechanism: 'react.recoverable',
        level: 'warning',
      }),
  }
}
