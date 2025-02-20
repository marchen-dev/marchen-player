import { BrowserWindow, nativeTheme } from 'electron'

import { t } from './_instance'

export type AppTheme = 'cmyk' | 'dark' | 'system'

export const settingRoute = {
  getWindowIsFullScreen: t.procedure.action(async ({ context }) => {
    const webContents = context.sender
    return BrowserWindow.fromWebContents(webContents)?.isFullScreen()
  }),
  setTheme: t.procedure.input<AppTheme>().action(async ({ input }) => {
    if (input === 'cmyk') {
      nativeTheme.themeSource = 'light'
      return
    }
    nativeTheme.themeSource = input
  }),
}
