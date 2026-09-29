import { registerIpc } from '@marchen/electron-ipc/main'
import { app } from 'electron'

import { router } from '../ipc'
import { isDev, isWindows } from '../lib/env'
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
  // windows 当主窗口已经创建情况下, 通过视频文件快捷打开
  if (isWindows) {
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
