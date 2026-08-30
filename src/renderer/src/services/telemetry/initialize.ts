import type { TelemetryClient } from './contracts'

import { isTelemetryEnabled, POSTHOG_KEY, SENTRY_DSN } from '@renderer/lib/env'
import { createCompositeTelemetryClient, createNoopTelemetryClient } from './client'
import { startTelemetrySession } from './session'

export const initializeRendererTelemetry = async () => {
  const clients: TelemetryClient[] = []

  if (SENTRY_DSN && isTelemetryEnabled) {
    try {
      // 构建常量让 Rollup 删除另一目标分支，避免 Web 包解析 Electron SDK。
      const target =
        __MARCHEN_TARGET__ === 'electron'
          ? await import('./sentry/targets/electron')
          : await import('./sentry/targets/web')
      clients.push(target.initializeSentryTarget())
    } catch (error) {
      console.warn('[telemetry] Renderer Sentry 初始化失败，已降级继续启动', error)
    }
  }

  if (POSTHOG_KEY && isTelemetryEnabled) {
    try {
      const target =
        __MARCHEN_TARGET__ === 'electron'
          ? await import('./posthog/targets/electron')
          : await import('./posthog/targets/web')
      clients.push(target.initializePostHogTarget(POSTHOG_KEY))
    } catch (error) {
      console.warn('[telemetry] Renderer PostHog 初始化失败，已降级继续启动', error)
    }
  }

  const client =
    clients.length > 0 ? createCompositeTelemetryClient(clients) : createNoopTelemetryClient()
  return startTelemetrySession({ client })
}
