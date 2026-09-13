/** 正式 Web / Electron 直连 API；localhost 尚未获 CORS 许可，Web dev 保留 Vite 代理。 */
export const API_URL =
  import.meta.env.DEV && !(typeof window !== 'undefined' && window.electron)
    ? '/api/v2'
    : import.meta.env.VITE_API_URL
export const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN?.trim() ?? ''
export const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY?.trim() ?? ''
export const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST?.trim() ?? ''

export const isDev = import.meta.env.DEV
export const isProd = import.meta.env.PROD
export const isTelemetryEnabled = isProd || import.meta.env.VITE_TELEMETRY_DEBUG === 'true'
