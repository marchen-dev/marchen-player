import type { BrowserOptions } from '@sentry/react'
import { SENTRY_DSN } from '@renderer/lib/env'
import * as Sentry from '@sentry/react'
import { useEffect } from 'react'
import { createRoutesFromChildren, matchRoutes, useLocation, useNavigationType } from 'react-router'

/** 仅用于性能隔离的回放屏蔽标记：弹幕运动层的高频 mutation 会让录制失控。 */
export const REPLAY_PERFORMANCE_BLOCK_SELECTOR = '[data-telemetry-replay-block]'

// 按产品决定完整上报界面文本、输入、URL 与诊断上下文，客户端不做脱敏或遮蔽。
export const createRendererSentryOptions = (): BrowserOptions => ({
  dsn: SENTRY_DSN,
  release: __MARCHEN_RELEASE__,
  dist: __MARCHEN_DIST__,
  environment: __MARCHEN_ENVIRONMENT__,
  enableLogs: true,
  beforeBreadcrumb: (event, hint) => {
    // 弹幕层不录回放，其上的 UI breadcrumb 也没有可对照的画面，直接忽略。
    const target = hint?.event?.target
    if (
      typeof Element !== 'undefined' &&
      target instanceof Element &&
      target.closest(REPLAY_PERFORMANCE_BLOCK_SELECTOR)
    )
      return null
    return event
  },
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
      useEffect,
      useLocation,
      useNavigationType,
      createRoutesFromChildren,
      matchRoutes,
    }),
    Sentry.httpClientIntegration(),
    Sentry.replayIntegration({
      maskAllText: false,
      maskAllInputs: false,
      blockAllMedia: false,
      block: [REPLAY_PERFORMANCE_BLOCK_SELECTOR],
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
