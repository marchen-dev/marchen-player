import { electronAPI } from '@electron-toolkit/preload'
import { contextBridge, webUtils } from 'electron'

const api = {
  showFilePath(file: File) {
    return webUtils.getPathForFile(file)
  },
}

// Sentry Preload IPC 必须在这些 bridge 暴露前完成连接。
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('platform', process.platform)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error (define in dts)
  window.electron = electronAPI
  // @ts-expect-error (define in dts)
  window.api = api
  // @ts-expect-error (define in dts)
  window.platform = process.platform
}
