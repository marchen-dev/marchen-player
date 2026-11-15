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
  // 界面语言与监控初始化并行确定；失败时保持默认的简体中文继续启动。
  const language = bootstrap
    .then(({ prepareLanguage }) => prepareLanguage())
    .catch((error) => {
      console.warn('[i18n] 界面语言初始化失败，已按简体中文继续启动', error)
    })
  const [{ mountRenderer }] = await Promise.all([bootstrap, instrumentation, language])
  performance.mark('marchen:modules-ready')
  mountRenderer()
  requestAnimationFrame(() => performance.mark('marchen:first-render-frame'))
}

void start()
