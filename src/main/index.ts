import path from 'node:path'

import { app } from 'electron'

import { isDev } from './lib/env'
import './register-schemes'

// userData、身份与离线状态都依赖 appData；开发目录必须在任何遥测模块加载前确定。
if (isDev) app.setPath('appData', path.join(app.getPath('appData'), 'Marchen (dev)'))

const start = async () => {
  try {
    const { initializeMainTelemetry } = await import('./telemetry/sentry')
    await initializeMainTelemetry()
  } catch (error) {
    // 遥测属于旁路能力，初始化失败不能阻止播放器启动。
    console.warn('[telemetry] Main 初始化失败，已降级继续启动', error)
  }

  await import('./bootstrap')
}

void start()
