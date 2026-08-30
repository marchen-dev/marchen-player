/**
 * Web 请求保持同源，由开发服务器或部署层反代；Electron 不受浏览器 CORS 限制，直连配置的代理。
 */
export const API_URL =
  typeof window !== 'undefined' && window.electron ? import.meta.env.VITE_API_URL : '/api/v2'
export const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN?.trim() ?? ''
export const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY?.trim() ?? ''
export const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST?.trim() ?? ''

export const isDev = import.meta.env.DEV
export const isProd = import.meta.env.PROD
export const isTelemetryEnabled = isProd || import.meta.env.VITE_TELEMETRY_DEBUG === 'true'
