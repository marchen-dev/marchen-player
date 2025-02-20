import { getRendererHandlers as getAppRendererHandlers } from '@egoist/tipc/main'
import { clearAllData } from '@main/lib/cleaner'
import { dialog } from 'electron'

import type { RendererHandlers } from '../tipc/renderer-handlers'
import { getMainWindow } from './main'

export const getRendererHandlers = () => {
  const mainWindow = getMainWindow()
  if (!mainWindow) {
    return
  }
  return getAppRendererHandlers<RendererHandlers>(mainWindow.webContents)
}

export const createSettingWindow = (tab?: string) => {
  const handlers = getRendererHandlers()
  handlers?.showSetting.send(tab)
}

export const importAnime = () => {
  const handlers = getRendererHandlers()
  handlers?.importAnime.send()
}

export const clearData = async () => {
  const win = getMainWindow()
  if (!win) {
    return
  }

  const result = await dialog.showMessageBox({
    type: 'warning',
    message: '这个行为会清除 APP 全部数据，包括历史记录和设置，确定要继续吗？',
    buttons: ['取消', '确定'],
  })
  if (!result.response) {
    return
  }

  return clearAllData()
}

export const updateProgress = (params: {
  progress: number
  status: 'downloading' | 'installing'
}) => {
  const handlers = getRendererHandlers()
  handlers?.updateProgress.send({ progress: params.progress, status: params.status })
}
