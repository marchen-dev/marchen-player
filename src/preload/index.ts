import { installPreloadErrorBridge } from './telemetry'

const telemetryEnabled =
  Boolean(import.meta.env.VITE_SENTRY_DSN?.trim()) &&
  (__MARCHEN_ENVIRONMENT__ === 'production' || import.meta.env.VITE_TELEMETRY_DEBUG === 'true')

const start = async () => {
  if (telemetryEnabled) {
    installPreloadErrorBridge()
    try {
      // Electron SDK 的 Preload 入口负责连接 Main/Renderer IPC；它不创建第二个客户端。
      await import('@sentry/electron/preload')
    } catch (error) {
      console.warn('[telemetry] Preload 初始化失败，已降级继续暴露 bridge', {
        runtime: 'preload',
        release: __MARCHEN_RELEASE__,
        error,
      })
    }
  }

  await import('./bootstrap')
}

void start()
