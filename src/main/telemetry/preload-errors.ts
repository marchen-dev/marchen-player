import type { PreloadErrorReport } from '@marchen/shared/constants/telemetry'
import { PRELOAD_ERROR_CHANNEL } from '@marchen/shared/constants/telemetry'
import * as Sentry from '@sentry/electron/main'
import { ipcMain } from 'electron'

const isReport = (value: unknown): value is PreloadErrorReport => {
  if (!value || typeof value !== 'object') return false
  const report = value as Partial<PreloadErrorReport>
  return (
    (report.kind === 'error' || report.kind === 'unhandledrejection') &&
    typeof report.name === 'string' &&
    typeof report.message === 'string' &&
    (report.stack === undefined || typeof report.stack === 'string')
  )
}

export const registerPreloadErrorBridge = (): void => {
  ipcMain.on(PRELOAD_ERROR_CHANNEL, (_event, payload: unknown) => {
    if (!isReport(payload)) return
    const error = new Error(payload.message)
    error.name = payload.name
    if (payload.stack) error.stack = payload.stack

    Sentry.withScope((scope) => {
      scope.setTags({
        runtime: 'preload',
        handled: false,
        mechanism: payload.kind,
      })
      Sentry.captureException(error)
    })
  })
}
