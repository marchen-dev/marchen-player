import { initializeRendererTelemetry } from './services/telemetry/initialize'

const start = async () => {
  performance.mark('marchen:startup-start')
  // 提前并行下载业务模块，挂载仍等监控就绪，保留首屏错误和路由埋点。
  const bootstrap = import('./renderer-bootstrap')
  const instrumentation = initializeRendererTelemetry()
    .catch((error) => {
      console.warn('[telemetry] Renderer instrumentation 失败，已降级继续启动', error)
    })
    .finally(() => performance.mark('marchen:telemetry-ready'))
  const [{ mountRenderer }] = await Promise.all([bootstrap, instrumentation])
  performance.mark('marchen:modules-ready')
  mountRenderer()
  requestAnimationFrame(() => performance.mark('marchen:first-render-frame'))
}

void start()
