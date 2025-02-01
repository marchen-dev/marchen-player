import fs from 'node:fs'

import { subtitlesPath } from '@main/constants/app'
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
        'websql',
        'filesystem',
        'indexdb',
        'localstorage',
        'shadercache',
        'websql',
        'serviceworkers',
        'cookies',
      ],
    })
    app.clearRecentDocuments()
    app.setLoginItemSettings({
      openAtLogin: false,
    })
    if (fs.existsSync(subtitlesPath())) {
      fs.rmSync(subtitlesPath(), { recursive: true })
    }
    win.reload()
  } catch (error: any) {
    console.error('Failed to clear data:', error)
  }
}
