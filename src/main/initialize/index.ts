import path from 'node:path'

import { registerIpcMain } from '@egoist/tipc/main'
import { app, protocol } from 'electron'
import logger from 'electron-log'

import { createStorageFolder } from '../constants/app'
import { MARCHEN_PROTOCOL } from '../constants/protocol'
import { isDev, isWindows } from '../lib/env'
import { quickLaunchViaVideo } from '../lib/utils'
import { router } from '../tipc'
import { getMainWindow } from '../windows/main'
import { getRendererHandlers } from '../windows/setting'
import { enableHardwareDecodingOnLinux } from './flag'
import { registerLog } from './log'
import { registerAppMenu } from './menu'
import { registerSentry } from './sentry'

export const initializeApp = () => {
  limitSingleInstance()
  enableHardwareDecodingOnLinux()
  registerSentry()
  registerIpcMain(router)
  registerAppMenu()
  registerLog()
  app.setAsDefaultProtocolClient(MARCHEN_PROTOCOL)
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MARCHEN_PROTOCOL,
      privileges: {
        bypassCSP: true,
        stream: true,
        standard: true,
      },
    },
  ])
  if (isDev) {
    app.setPath('appData', path.join(app.getPath('appData'), 'Marchen (dev)'))
  }
  createStorageFolder()

  // macOS 通过视频文件快捷打开
  app.on('open-file', (event, url) => {
    event.preventDefault()
    logger.info('[app] macOS open-file url', url)
    const mainWindow = getMainWindow()
    // 当主窗口已经创建时，通过 tipc 通知渲染进程打开视频文件
    if (mainWindow) {
      return getRendererHandlers()?.importAnime.send({ path: url })
    }

    // 当主窗口未创建时，将视频文件路径添加到 process.argv 中, 等在主窗口创建后再处理
    process.argv.push(url)
  })

  // windows 当主窗口已经创建情况下, 通过视频文件快捷打开
  if (isWindows) {
    app.on('second-instance', () => {
      const mainWindow = getMainWindow()
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.show()
      }

      quickLaunchViaVideo()
    })
  }
}

const limitSingleInstance = () => {
  const gotTheLock = app.requestSingleInstanceLock()

  if (!gotTheLock) {
    app.quit()
    return
  }
}
