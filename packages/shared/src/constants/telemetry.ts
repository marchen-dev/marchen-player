export const PRELOAD_ERROR_CHANNEL = 'marchen:telemetry:preload-error'

export interface PreloadErrorReport {
  kind: 'error' | 'unhandledrejection'
  name: string
  message: string
  stack?: string
}
