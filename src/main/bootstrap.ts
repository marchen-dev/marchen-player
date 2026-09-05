import { electronApp, optimizer } from '@electron-toolkit/utils'
import { MARCHEN_PROTOCOL } from '@marchen/shared/constants/protocol'
import { name } from '@pkg'
import { app, BrowserWindow, powerMonitor, protocol } from 'electron'

import { initializeApp } from './initialize'
import { isDev } from './lib/env'
import { getIconPath } from './lib/icon'
import { getFilePathFromProtocolURL, handleCustomProtocol } from './lib/protocols'
import { autoUpdateInit } from './lib/update'
import { shutdownFfmpegService } from './modules/ffmpeg/service'
import { startMediaGateway, stopMediaGateway } from './modules/media-gateway/service'
import { shutdownMediaSessions } from './modules/media-gateway/session-service'
import createWindow from './windows/main'

export const bootstrap = () => {
  // 桌面播放器的拖入/历史续播就是用户的明确播放意图；HLS attach 完成后
  // 不应再被 Chromium 的 Web 无手势 autoplay 规则暂停在黑色首帧。
  if (!app.commandLine.hasSwitch('autoplay-policy')) {
    app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
  }
  // 开发模式下暴露 Chrome DevTools Protocol 远程调试端口，必须在 ready 前设置。
  if (isDev && !app.commandLine.hasSwitch('remote-debugging-port')) {
    app.commandLine.appendSwitch('remote-debugging-port', '9222')
  }

  initializeApp()
  app.whenReady().then(async () => {
    await startMediaGateway().catch((error) => console.error('[media-gateway] 启动失败', error))
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

    powerMonitor.on('suspend', () => {
      void shutdownMediaSessions('sleep').catch((error) =>
        console.error('[media-session] 睡眠清理失败', error),
      )
    })

    if (app.dock && isDev) app.dock.setIcon(getIconPath())

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  let quitCleanupStarted = false
  app.on('before-quit', (event) => {
    if (quitCleanupStarted) return
    event.preventDefault()
    quitCleanupStarted = true
    void shutdownMediaSessions('app-quit')
      .catch((error) => console.error('[media-session] 退出清理失败', error))
      .finally(() => {
        shutdownFfmpegService()
        return stopMediaGateway()
      })
      .finally(() => app.quit())
  })
}

bootstrap()
