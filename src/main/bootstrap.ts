import { join } from 'node:path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { MARCHEN_PROTOCOL } from '@marchen/shared/constants/protocol'
import { name } from '@pkg'
import { app, BrowserWindow, protocol } from 'electron'
import { initializeApp } from './initialize'

import { writeLog } from './lib/diagnostic-log'
import { isDev } from './lib/env'
import { fileOpenRequests } from './lib/file-open-requests'
import { getIconPath } from './lib/icon'
import { createApplicationProtocol } from './lib/media-protocol'
import { autoUpdateInit } from './lib/update'
import { initializeDownloads } from './services/downloads/lifecycle'
import createWindow, { getMainWindow } from './windows/main'

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
  // GPU / 工具进程等子进程崩溃：常见于硬件解码与显卡驱动问题，是播放故障的重要线索
  app.on('child-process-gone', (_event, details) => {
    writeLog({
      lv: details.reason === 'clean-exit' ? 'info' : 'error',
      cat: 'process',
      msg: 'child_process_gone',
      data: {
        type: details.type,
        reason: details.reason,
        exitCode: details.exitCode,
        name: details.name,
        serviceName: details.serviceName,
      },
    })
  })
  app.whenReady().then(() => {
    writeStartupSnapshot()
    initializeDownloads()
    autoUpdateInit()
    electronApp.setAppUserModelId(`re.${name}`)

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
      // toolkit 仅在开发态处理 F12，打包版补上本地排错入口。
      if (app.isPackaged) {
        window.webContents.on('before-input-event', (event, input) => {
          const isDevToolsShortcut =
            input.code === 'F12' ||
            (input.code === 'KeyI' &&
              (process.platform === 'darwin'
                ? input.meta && input.alt
                : input.control && input.shift))
          if (input.type !== 'keyDown' || !isDevToolsShortcut) return
          event.preventDefault()
          if (input.isAutoRepeat) return
          if (window.webContents.isDevToolsOpened()) {
            window.webContents.closeDevTools()
          } else {
            window.webContents.openDevTools({ mode: 'undocked' })
          }
        })
      }
    })

    protocol.handle(MARCHEN_PROTOCOL, createApplicationProtocol(join(__dirname, '../renderer')))

    createWindow()
    fileOpenRequests.setWindowOpener(() => {
      const window = getMainWindow() ?? createWindow()
      if (window.isMinimized()) window.restore()
      window.show()
      window.focus()
    })

    if (app.dock && isDev) app.dock.setIcon(getIconPath())

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

/** 每次启动写一条主进程环境快照；构建信息只在这里出现，不在每条日志中重复 */
function writeStartupSnapshot() {
  writeLog({
    lv: 'info',
    cat: 'app',
    msg: 'app_start',
    data: {
      version: app.getVersion(),
      release: __MARCHEN_RELEASE__,
      dist: __MARCHEN_DIST__,
      commit: __MARCHEN_COMMIT__,
      environment: __MARCHEN_ENVIRONMENT__,
      packaged: app.isPackaged,
      os: `${process.platform} ${process.getSystemVersion()}`,
      arch: process.arch,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      locale: app.getLocale(),
      gpu: app.getGPUFeatureStatus(),
    },
  })
}

bootstrap()
