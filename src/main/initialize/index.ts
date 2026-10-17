import { registerIpc } from '@marchen/electron-ipc/main'
import { app } from 'electron'

import { router } from '../ipc'
import { isDev, isMacOS } from '../lib/env'
import { fileOpenRequests } from '../lib/file-open-requests'
import { getMainWindow } from '../windows/main'
import { registerLog } from './log'
import { registerAppMenu } from './menu'

export const initializeApp = () => {
  // 自动化验收或并行调试时可显式开启开发多实例；生产环境始终保持单实例。
  if (!isDev || process.env.MARCHEN_ALLOW_MULTIPLE_INSTANCES !== '1') {
    limitSingleInstance()
  }
  registerIpc(router)
  registerAppMenu()
  registerLog()
  // Windows / Linux 在主窗口已存在时再次打开文件，系统会启动第二个进程并经 argv 传入路径；
  // 第二个进程拿不到单实例锁会退出，必须由已有实例接收 argv，否则文件会丢失。
  // macOS 通过 open-file 事件传递，不走这里。
  if (!isMacOS) {
    app.on('second-instance', (_event, commandLine) => {
      const mainWindow = getMainWindow()
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.show()
      }

      fileOpenRequests.requestFromArgv(commandLine)
    })
  }
}

const limitSingleInstance = () => {
  const gotTheLock = app.requestSingleInstanceLock()

  if (!gotTheLock) {
    app.quit()
  }
}
