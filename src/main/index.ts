import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { app } from 'electron'

import { isDev } from './lib/env'
import { fileOpenRequests } from './lib/file-open-requests'
import './register-schemes'

// userData、身份与离线状态都依赖 appData；开发目录必须在任何遥测模块加载前确定。
if (isDev) app.setPath('appData', path.join(app.getPath('appData'), 'Marchen (dev)'))
// E2E 使用独立 userData（也隔离单实例锁），允许与日常开发窗口同时运行。
if (isDev && process.env.MARCHEN_DEV_USER_DATA_DIR) {
  const testUserData = path.resolve(process.env.MARCHEN_DEV_USER_DATA_DIR)
  mkdirSync(testUserData, { recursive: true })
  app.setPath('userData', testUserData)
}

// Finder 的文件事件可能早于 ready；必须在任何异步初始化前接住。
app.on('open-file', (event, path) => {
  event.preventDefault()
  fileOpenRequests.request(path)
})
fileOpenRequests.requestFromArgv(process.argv)

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
