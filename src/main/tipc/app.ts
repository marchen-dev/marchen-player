import { getFilePathFromProtocolURL } from '@main/lib/protocols'
import { parseReleaseNotes } from '@main/lib/utils'
import { getMainWindow } from '@main/windows/main'
import { clearData } from '@main/windows/setting'
import { version } from '@pkg'
import { app, BrowserWindow, dialog } from 'electron'
import updater from 'electron-updater'

import { t } from './_instance'

export const appRoute = {
  windowAction: t.procedure
    .input<{
      action:
        | 'close'
        | 'minimize'
        | 'maximum'
        | 'restart'
        | 'reset'
        | 'enter-full-screen'
        | 'leave-full-screen'
        | 'switch-full-screen'
        | 'hidden-title-bar'
        | 'show-title-bar'
        | 'hidden-title-bar'
    }>()
    .action(async ({ context, input }) => {
      const webcontent = context.sender

      const window = BrowserWindow.fromWebContents(webcontent)
      if (!window) return

      switch (input.action) {
        case 'close': {
          window.close()
          break
        }
        case 'minimize': {
          window.minimize()
          break
        }
        case 'maximum': {
          if (window.isMaximized()) {
            window.unmaximize()
          } else {
            window.maximize()
          }
          break
        }
        case 'restart': {
          getMainWindow()?.reload()
          break
        }
        case 'reset': {
          clearData() 
          break
        }
        case 'switch-full-screen': {
          if (window.isFullScreen()) {
            window.setFullScreen(false)
          } else {
            window.setFullScreen(true)
          }
          break
        }
        case 'enter-full-screen': {
          window.setFullScreen(true)
          break
        }
        case 'leave-full-screen': {
          window.setFullScreen(false)
          break
        }
        case 'hidden-title-bar': {
          window?.setWindowButtonVisibility(false)
          break
        }
        case 'show-title-bar': {
          window?.setWindowButtonVisibility(true)
          break
        }
      }
    }),
  checkUpdate: t.procedure.action(async () => {
    const updateCheckResult = await updater.autoUpdater.checkForUpdates()
    if (updateCheckResult?.updateInfo.version === version) {
      return dialog.showMessageBox({
        type: 'info',
        message: '当前已是最新版本',
      })
    }

    const releaseNotes = updateCheckResult?.updateInfo.releaseNotes

    const releaseContent = parseReleaseNotes(releaseNotes)

    dialog.showMessageBox({
      type: 'info',
      detail: releaseContent,
      message: '发现新版本，正在下载更新...',
    })
    return releaseContent
  }),
  installUpdate: t.procedure.action(async () => {
    updater.autoUpdater.quitAndInstall()
  }),
  confirmationDialog: t.procedure.input<{ title: string }>().action(async ({ input }) => {
    const result = await dialog.showMessageBox({
      type: 'warning',
      message: input.title,
      buttons: ['取消', '确认'],
    })
    return !!result.response
  }),
  addRecentDocument: t.procedure.input<{ path: string }>().action(async ({ input }) => {
    const filePath = getFilePathFromProtocolURL(input.path)
    app.addRecentDocument(filePath)
  }),
}
