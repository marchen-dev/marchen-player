import { getFilePathFromProtocolURL } from '@main/lib/protocols'
import { parseReleaseNotes } from '@main/lib/utils'
import { getMainWindow } from '@main/windows/main'
import { clearData } from '@main/windows/setting'
import { defineGroup } from '@marchen/electron-ipc/main'
import { version } from '@pkg'
import { app, BrowserWindow, dialog } from 'electron'
import Logger from 'electron-log'
import updater from 'electron-updater'

/**
 * app 分组：应用级别的 IPC handler
 * 包含窗口操作、更新检查、对话框等通用功能
 */
export const appGroup = defineGroup('app', {
  /**
   * 窗口操作：关闭、最小化、最大化、全屏切换等
   * 根据 action 类型执行对应的窗口操作
   */
  windowAction: async ({ context, input }) => {
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
      case 'laungh-at-login': {
        app.setLoginItemSettings({
          openAtLogin: input.checked,
        })
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
  },

  /** 检查应用更新，弹出对话框显示结果 */
  checkUpdate: async () => {
    try {
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
    } catch (error) {
      Logger.error(['检查更新失败', error])
      return dialog.showMessageBox({
        type: 'warning',
        detail: '请确保网络可以正常访问 Github',
        message: '检查更新失败',
      })
    }
  },

  /** 退出应用并安装已下载的更新 */
  installUpdate: async () => {
    updater.autoUpdater.quitAndInstall()
  },

  /** 显示确认对话框，返回用户是否点击了"确认" */
  confirmationDialog: async ({ input }) => {
    const result = await dialog.showMessageBox({
      type: 'warning',
      message: input.title,
      buttons: ['取消', '确认'],
    })
    return !!result.response
  },

  /** 将文件路径添加到系统的"最近打开"列表 */
  addRecentDocument: async ({ input }) => {
    const filePath = getFilePathFromProtocolURL(input.path)
    app.addRecentDocument(filePath)
  },
})
