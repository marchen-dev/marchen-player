import os from 'node:os'

export const mode = process.env.NODE_ENV
export const isDev = mode === 'development'
export const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN?.trim() ?? ''
export const isTelemetryEnabled = !isDev || import.meta.env.VITE_TELEMETRY_DEBUG === 'true'

const { platform } = process
export const isMacOS = platform === 'darwin'

export const isWindows = platform === 'win32'

export const isLinux = platform === 'linux'
export const isWindows11 = isWindows && os.version().startsWith('Windows 11')
