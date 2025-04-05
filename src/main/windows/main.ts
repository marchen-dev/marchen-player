import { join } from 'node:path'

import { is } from '@electron-toolkit/utils'
import { quickLaunchViaVideo } from '@main/lib/utils'
import { app, BrowserWindow, shell } from 'electron'

import { getIconPath } from '../lib/icon'
import { getRendererHandlers } from './setting'

const { platform } = process

const isDev = process.env.NODE_ENV === 'development'

const windows = {
  mainWindow: null as BrowserWindow | null,
}

globalThis['windows'] = windows
export default function createWindow() {
  // Create the browser window.
  const baseWindowsConfig: Electron.BrowserWindowConstructorOptions = {
    width: 1200,
    height: 900,
    minWidth: 800, // 设置最小宽度
    minHeight: 650, // 设置最小高度
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
    },
  }
  switch (platform) {
    case 'darwin': {
      Object.assign(baseWindowsConfig, {
        trafficLightPosition: {
          x: 18,
          y: 18,
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
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return mainWindow
}

export const getMainWindow = () => windows.mainWindow

const initializeListeningEvent = (mainWindow: BrowserWindow) => {
  mainWindow.on('ready-to-show', () => {
    isDev ? mainWindow.showInactive() : mainWindow.show()

    // 当软件未运行时的情况下，通过视频快速启动
    quickLaunchViaVideo()
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
