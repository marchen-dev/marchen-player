import {
  acknowledgeUpdateSave,
  checkForDesktopUpdates,
  downloadDesktopUpdate,
  getInstalledUpdateNotice,
  getUpdateState,
  installDesktopUpdate,
  openUpdateDownloadPage,
  setUpdatePlaybackState,
} from '@main/lib/update'
import { getOrCreateTelemetryInstallId, telemetryAppSessionId } from '@main/telemetry/identity'
import { getMainWindow } from '@main/windows/main'
import { clearData } from '@main/windows/setting'
import { tipc } from '@marchen/electron-ipc/main'
import { app, BrowserWindow, dialog } from 'electron'

const t = tipc.create()

export const appGroup = {
  getTelemetryIdentity: t.procedure.action(async () => ({
    installId: await getOrCreateTelemetryInstallId(),
    appSessionId: telemetryAppSessionId,
    platform: process.platform,
    arch: process.arch,
  })),

  windowAction: t.procedure
    .input<{
      action:
        | 'close'
        | 'minimize'
        | 'maximum'
        | 'restart'
        | 'reset'
        | 'laungh-at-login'
        | 'enter-full-screen'
        | 'leave-full-screen'
        | 'switch-full-screen'
        | 'hidden-title-bar'
        | 'show-title-bar'
      checked?: boolean
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
    }),

  checkUpdate: t.procedure.action(() => checkForDesktopUpdates()),
  getInstalledUpdate: t.procedure.action(() => getInstalledUpdateNotice()),
  getUpdateState: t.procedure.action(async () => getUpdateState()),
  downloadUpdate: t.procedure.action(() => downloadDesktopUpdate()),
  installUpdate: t.procedure.action(() => installDesktopUpdate()),
  openUpdateDownload: t.procedure.action(() => openUpdateDownloadPage()),
  updateSaved: t.procedure
    .input<{ id: string; success: boolean; message?: string }>()
    .action(async ({ input }) => acknowledgeUpdateSave(input.id, input.success, input.message)),
  updatePlaybackState: t.procedure
    .input<{ playing: boolean }>()
    .action(async ({ input }) => setUpdatePlaybackState(input.playing)),

  confirmationDialog: t.procedure.input<{ title: string }>().action(async ({ input }) => {
    const result = await dialog.showMessageBox({
      type: 'warning',
      message: input.title,
      buttons: ['取消', '确认'],
    })
    return !!result.response
  }),

  addRecentDocument: t.procedure.input<{ path: string }>().action(async ({ input }) => {
    app.addRecentDocument(input.path)
  }),
}
