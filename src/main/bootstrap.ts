import { join } from 'node:path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { MARCHEN_PROTOCOL } from '@marchen/shared/constants/protocol'
import { name } from '@pkg'
import { app, BrowserWindow, protocol } from 'electron'

import { initializeApp } from './initialize'
import { isDev } from './lib/env'
import { getIconPath } from './lib/icon'
import { createApplicationProtocol } from './lib/media-protocol'
import { autoUpdateInit } from './lib/update'
import createWindow from './windows/main'

export const bootstrap = () => {
  // 桌面播放器的拖入/历史续播就是用户的明确播放意图；媒体准备完成后
  // 不应再被 Chromium 的 Web 无手势 autoplay 规则暂停在黑色首帧。
  if (!app.commandLine.hasSwitch('autoplay-policy')) {
    app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
  }
  // 开发模式下暴露 Chrome DevTools Protocol 远程调试端口，必须在 ready 前设置。
  if (isDev && !app.commandLine.hasSwitch('remote-debugging-port')) {
    app.commandLine.appendSwitch('remote-debugging-port', '9222')
  }

  initializeApp()
  app.whenReady().then(() => {
    autoUpdateInit()
    electronApp.setAppUserModelId(`re.${name}`)

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    protocol.handle(MARCHEN_PROTOCOL, createApplicationProtocol(join(__dirname, '../renderer')))

    createWindow()

    if (app.dock && isDev) app.dock.setIcon(getIconPath())

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

bootstrap()
