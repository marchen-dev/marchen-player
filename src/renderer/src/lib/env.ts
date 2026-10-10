import { readApiRouteConfig } from '@renderer/request/api-route-config'
export const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN?.trim() ?? ''
export const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY?.trim() ?? ''
export const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST?.trim() ?? ''

export const isDev = import.meta.env.DEV
export const isProd = import.meta.env.PROD
export const isTelemetryEnabled = isProd || import.meta.env.VITE_TELEMETRY_DEBUG === 'true'

export const API_ROUTES = readApiRouteConfig(import.meta.env)
