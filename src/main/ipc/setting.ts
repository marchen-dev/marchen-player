import { defineGroup } from '@marchen/electron-ipc/main'
import { BrowserWindow, nativeTheme } from 'electron'

/**
 * setting 分组：应用设置相关的 IPC handler
 * 包含窗口状态查询和主题切换
 */
export const settingGroup = defineGroup('setting', {
  /** 查询当前窗口是否处于全屏状态 */
  getWindowIsFullScreen: async ({ context }) => {
    const webContents = context.sender
    return BrowserWindow.fromWebContents(webContents)?.isFullScreen()
  },

  /** 设置应用主题（light/dark/system） */
  setTheme: async ({ input }) => {
    if (input === 'light') {
      nativeTheme.themeSource = 'light'
      return
    }
    nativeTheme.themeSource = input
  },
})
