import { resetTelemetryInstallId } from '@main/telemetry/identity'
import { resetMainTelemetryIdentity } from '@main/telemetry/sentry'
import { getMainWindow } from '@main/windows/main'
import { app } from 'electron'

export const clearAllData = async () => {
  const win = getMainWindow()
  if (!win) return
  const ses = win.webContents.session

  try {
    await ses.clearCache()

    await ses.clearStorageData({
      storages: [
        'filesystem',
        'indexdb',
        'localstorage',
        'shadercache',
        'serviceworkers',
        'cookies',
      ],
    })
    app.clearRecentDocuments()
    app.setLoginItemSettings({
      openAtLogin: false,
    })
    resetMainTelemetryIdentity()
    await resetTelemetryInstallId()
    win.reload()
  } catch (error: any) {
    console.error('Failed to clear data:', error)
  }
}
