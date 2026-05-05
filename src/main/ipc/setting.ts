import { tipc } from '@marchen/electron-ipc/main'
import { BrowserWindow, nativeTheme } from 'electron'

export type AppTheme = 'light' | 'dark' | 'system'

const t = tipc.create()

export const settingGroup = {
  getWindowIsFullScreen: t.procedure.action(async ({ context }) => {
    const webContents = context.sender
    return BrowserWindow.fromWebContents(webContents)?.isFullScreen()
  }),

  setTheme: t.procedure.input<AppTheme>().action(async ({ input }) => {
    if (input === 'light') {
      nativeTheme.themeSource = 'light'
      return
    }
    nativeTheme.themeSource = input
  }),
}
