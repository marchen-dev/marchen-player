import * as Sentry from '@sentry/electron/main'

import { isTelemetryEnabled, SENTRY_DSN } from '../lib/env'
import { getOrCreateTelemetryInstallId, telemetryAppSessionId } from './identity'
import { registerPreloadErrorBridge } from './preload-errors'

const buildTags = {
  app_target: __MARCHEN_TARGET__,
  runtime: 'main',
  dist: __MARCHEN_DIST__,
  commit: __MARCHEN_COMMIT__,
  platform: process.platform,
  arch: process.arch,
  app_session_id: telemetryAppSessionId,
}

export const initializeMainTelemetry = async (): Promise<void> => {
  if (!SENTRY_DSN || !isTelemetryEnabled) return

  Sentry.init({
    // 默认 Both 会重新注册 Sentry 协议并覆盖 marchen 的 secure 声明。
    // 已有 Preload bridge 承接 SDK 通信，固定 Electron IPC 保留应用协议权限。
    ipcMode: Sentry.IPCMode.Classic,
    dsn: SENTRY_DSN,
    release: __MARCHEN_RELEASE__,
    dist: __MARCHEN_DIST__,
    environment: __MARCHEN_ENVIRONMENT__,
    enableLogs: true,
    sendDefaultPii: true,
    tracesSampleRate: 1,
  })
  Sentry.setTags(buildTags)
  registerPreloadErrorBridge()

  const installId = await getOrCreateTelemetryInstallId()
  Sentry.setUser({ id: installId })
  Sentry.setTag('install_id', installId)
}

export const resetMainTelemetryIdentity = (): void => {
  Sentry.setUser(null)
  Sentry.setTag('install_id', undefined)
}
