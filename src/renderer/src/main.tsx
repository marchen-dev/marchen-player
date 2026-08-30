import { initializeRendererTelemetry } from './services/telemetry/initialize'

const start = async () => {
  try {
    await initializeRendererTelemetry()
  } catch (error) {
    console.warn('[telemetry] Renderer instrumentation 失败，已降级继续启动', error)
  }

  await import('./renderer-bootstrap')
}

void start()
