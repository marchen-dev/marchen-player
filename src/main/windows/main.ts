import { join } from 'node:path'

import { is } from '@electron-toolkit/utils'
import { writeLog } from '@main/lib/diagnostic-log'
import { fileOpenRequests } from '@main/lib/file-open-requests'
import { app, BrowserWindow, nativeTheme, shell } from 'electron'

import { getIconPath } from '../lib/icon'
import { getRendererHandlers } from './setting'

const { platform } = process

const isDev = process.env.NODE_ENV === 'development'

const windows = {
  mainWindow: null as BrowserWindow | null,
}

globalThis.windows = windows
export default function createWindow() {
  // Create the browser window.
  const baseWindowsConfig: Electron.BrowserWindowConstructorOptions = {
    width: 1400,
    height: 900,
    minWidth: 800, // 设置最小宽度
    minHeight: 650, // 设置最小高度
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#121212' : '#fafafa',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      // 切换桌面仍持续播放；Canvas 的音频排程不能被后台计时器节流。
      backgroundThrottling: false,
    },
  }
  switch (platform) {
    case 'darwin': {
      Object.assign(baseWindowsConfig, {
        trafficLightPosition: {
          x: 8,
          y: 12,
        },
        titleBarStyle: 'hiddenInset',
      } as Electron.BrowserWindowConstructorOptions)
      break
    }
    case 'win32': {
      Object.assign(baseWindowsConfig, {
        titleBarStyle: 'hidden',
        backgroundMaterial: 'mica',
        icon: getIconPath(),
      } as Electron.BrowserWindowConstructorOptions)
      break
    }
    default: {
      Object.assign(baseWindowsConfig, {
        icon: getIconPath(),
      } as Electron.BrowserWindowConstructorOptions)
    }
  }

  windows.mainWindow = new BrowserWindow(baseWindowsConfig)

  const { mainWindow } = windows
  mainWindow.webContents.userAgent = `MarchenPlayer/${app.getVersion()}`
  initializeListeningEvent(mainWindow)

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadURL('marchen://app/index.html')
  }
  return mainWindow
}

export const getMainWindow = () => {
  const window = windows.mainWindow
  return window && !window.isDestroyed() ? window : null
}

const initializeListeningEvent = (mainWindow: BrowserWindow) => {
  // 重载和关闭后，必须重新等待新页面注册接收监听。
  mainWindow.webContents.on('did-start-loading', () => {
    fileOpenRequests.rendererUnavailable()
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    fileOpenRequests.rendererUnavailable()
    writeLog({
      lv: 'error',
      cat: 'window',
      msg: 'render_process_gone',
      data: { reason: details.reason, exitCode: details.exitCode },
    })
  })
  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return
      writeLog({
        lv: 'error',
        cat: 'window',
        msg: 'did_fail_load',
        data: { errorCode, errorDescription, url: validatedURL },
      })
    },
  )
  mainWindow.on('unresponsive', () => {
    writeLog({ lv: 'warn', cat: 'window', msg: 'window_unresponsive' })
  })
  mainWindow.on('responsive', () => {
    writeLog({ lv: 'info', cat: 'window', msg: 'window_responsive' })
  })
  mainWindow.on('closed', () => {
    if (windows.mainWindow !== mainWindow) return
    windows.mainWindow = null
    fileOpenRequests.rendererUnavailable()
  })

  mainWindow.on('ready-to-show', () => {
    isDev ? mainWindow.showInactive() : mainWindow.show()
  })

  mainWindow.on('enter-full-screen', () => {
    getRendererHandlers()?.windowAction.send('enter-full-screen')
  })

  mainWindow.on('leave-full-screen', () => {
    getRendererHandlers()?.windowAction.send('leave-full-screen')
  })

  mainWindow.on('maximize', () => {
    getRendererHandlers()?.windowAction.send('maximize')
  })

  mainWindow.on('unmaximize', () => {
    getRendererHandlers()?.windowAction.send('unmaximize')
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
}
