import { defineGroup, handler } from '@marchen/electron-ipc/main'
import { BrowserWindow, nativeTheme } from 'electron'

/** 应用主题类型 */
export type AppTheme = 'light' | 'dark' | 'system'

/**
 * setting 分组：应用设置相关的 IPC handler
 * 包含窗口状态查询和主题切换
 */
export const settingGroup = defineGroup('setting', {
  /** 查询当前窗口是否处于全屏状态 */
  getWindowIsFullScreen: handler().action(async ({ context }) => {
    const webContents = context.sender
    return BrowserWindow.fromWebContents(webContents)?.isFullScreen()
  }),

  /** 设置应用主题（light/dark/system） */
  setTheme: handler<AppTheme>().action(async ({ input }) => {
    if (input === 'light') {
      nativeTheme.themeSource = 'light'
      return
    }
    nativeTheme.themeSource = input
  }),
})
