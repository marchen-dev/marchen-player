import { electronAPI } from '@electron-toolkit/preload'
import { contextBridge, webUtils } from 'electron'

// Custom APIs for renderer
const api = {
  showFilePath(file: File) {
    // It's best not to expose the full file path to the web content if
    // possible.
    const path = webUtils.getPathForFile(file)
    return path
  },
}
// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
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
