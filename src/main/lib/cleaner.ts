import { clearLogs, writeLog } from '@main/lib/diagnostic-log'
import { resetTelemetryInstallId } from '@main/telemetry/identity'
import { resetMainTelemetryIdentity } from '@main/telemetry/sentry'
import { getMainWindow } from '@main/windows/main'
import { app } from 'electron'
import { clearDownloads } from '../services/downloads/service'

export const clearAllData = async () => {
  const win = getMainWindow()
  if (!win) return
  const ses = win.webContents.session

  try {
    await clearDownloads()
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
    // 重置即清除全部记录；日志目录不在 userData 下，需单独清空，并留下重置时间点
    clearLogs()
    writeLog({ lv: 'info', cat: 'app', msg: 'app_reset' })
    win.reload()
  } catch (error: any) {
    console.error('Failed to clear data:', error)
    throw error
  }
}
