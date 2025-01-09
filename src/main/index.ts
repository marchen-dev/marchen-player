import { electronApp, optimizer } from '@electron-toolkit/utils'
import { name } from '@pkg'
import { app, BrowserWindow, protocol } from 'electron'
import unhandled from 'electron-unhandled'

import { MARCHEN_PROTOCOL } from './constants/protocol'
import { initializeApp } from './initialize'
import { isDev } from './lib/env'
import { getIconPath } from './lib/icon'
import { getFilePathFromProtocolURL, handleCustomProtocol } from './lib/protocols'
import { autoUpdateInit } from './lib/update'
import createWindow from './windows/main'

function bootstrap() {
  initializeApp()
  app.whenReady().then(() => {
    autoUpdateInit()
    electronApp.setAppUserModelId(`re.${name}`)

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    protocol.handle(MARCHEN_PROTOCOL, async (request) => {
      const filePath = getFilePathFromProtocolURL(request.url)
      return handleCustomProtocol(filePath, request)
    })

    createWindow()

    if (app.dock && isDev) {
      app.dock.setIcon(getIconPath())
    }

    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  // Quit when all windows are closed, except on macOS. There, it's common
  // for applications and their menu bar to stay active until the user quits
  // explicitly with Cmd + Q.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
  unhandled()
}

bootstrap()
