import type { BrowserOptions } from '@sentry/react'
import { SENTRY_DSN } from '@renderer/lib/env'
import * as Sentry from '@sentry/react'
import { useEffect } from 'react'
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router'

export const isNoisyGatewayMediaRequest = (url: string): boolean => {
  try {
    const base = typeof window === 'undefined' ? 'http://localhost/' : window.location.href
    const parsed = new URL(url, base)
    const isLocalGateway = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost'
    return (
      isLocalGateway &&
      parsed.pathname.includes('/v1/media/') &&
      /(?:\.m4s|\/init\.mp4|\.m3u8)$/i.test(parsed.pathname)
    )
  } catch {
    return false
  }
}

export const createRendererSentryOptions = (): BrowserOptions => ({
  dsn: SENTRY_DSN,
  release: __MARCHEN_RELEASE__,
  dist: __MARCHEN_DIST__,
  environment: __MARCHEN_ENVIRONMENT__,
  enableLogs: true,
  sendDefaultPii: true,
  tracesSampleRate: 1,
  // 当前代理没有声明接受 sentry-trace/baggage，只记录客户端 span，不跨域传播。
  tracePropagationTargets: [],
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1,
  integrations: [
    Sentry.reactRouterBrowserTracingIntegration({
      instrumentNavigation: false,
      instrumentPageLoad: false,
      shouldCreateSpanForRequest: (url) => !isNoisyGatewayMediaRequest(url),
      useEffect,
      useLocation,
      useNavigationType,
      createRoutesFromChildren,
      matchRoutes,
    }),
    Sentry.httpClientIntegration(),
    Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
      block: ['[data-telemetry-replay-block]'],
    }),
  ],
  initialScope: {
    tags: {
      app_target: __MARCHEN_TARGET__,
      runtime: 'renderer',
      dist: __MARCHEN_DIST__,
      commit: __MARCHEN_COMMIT__,
    },
  },
})
