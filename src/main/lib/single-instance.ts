import { app } from 'electron'
import { isDev, isMacOS } from './env'
import { fileOpenRequests } from './file-open-requests'

/** 必须在异步启动前执行；失去锁的进程不能继续初始化或创建窗口。 */
export function acquireSingleInstance() {
  if (isDev && process.env.MARCHEN_ALLOW_MULTIPLE_INSTANCES === '1') return true

  // 先接收二次启动意图，窗口尚未创建时由队列保存。
  if (!isMacOS) {
    app.on('second-instance', (_event, commandLine) => {
      fileOpenRequests.activateWindow()
      fileOpenRequests.requestFromArgv(commandLine)
    })
  }
  if (app.requestSingleInstanceLock()) return true
  app.quit()
  return false
}
