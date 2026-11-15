import { tipc } from '@marchen/electron-ipc/main'
import { BrowserWindow, nativeTheme } from 'electron'
import { getSystemLanguages, setMainLanguage } from '../lib/i18n'

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

  /**
   * 页面上报当前界面语言（启动时与每次切换时）。主进程据此更新应用菜单并保存镜像，
   * 供下次冷启动在页面加载前使用。输入在 setMainLanguage 里校验，未知值被忽略。
   */
  setLanguage: t.procedure.input<string>().action(async ({ input }) => {
    setMainLanguage(input)
  }),

  /** 系统首选语言列表；页面用它解析「跟随系统」，保证与主进程的结论一致 */
  getSystemLanguages: t.procedure.action(async () => getSystemLanguages()),
}
