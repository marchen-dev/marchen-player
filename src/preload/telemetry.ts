import type { PreloadErrorReport } from '@marchen/shared/constants/telemetry'
import { PRELOAD_ERROR_CHANNEL } from '@marchen/shared/constants/telemetry'
import { ipcRenderer } from 'electron'

const bounded = (value: unknown, maxLength: number): string =>
  String(value ?? 'Unknown preload error').slice(0, maxLength)

const report = (value: unknown, kind: PreloadErrorReport['kind']) => {
  const error = value instanceof Error ? value : new Error(bounded(value, 4_000))
  const payload: PreloadErrorReport = {
    kind,
    name: bounded(error.name, 100),
    message: bounded(error.message, 4_000),
    stack: error.stack ? bounded(error.stack, 16_000) : undefined,
  }
  ipcRenderer.send(PRELOAD_ERROR_CHANNEL, payload)
}

export const installPreloadErrorBridge = (): void => {
  window.addEventListener('error', (event) => report(event.error ?? event.message, 'error'))
  window.addEventListener('unhandledrejection', (event) =>
    report(event.reason, 'unhandledrejection'),
  )
}
