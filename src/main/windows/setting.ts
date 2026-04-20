import type { RendererHandlers } from '@marchen/shared/types/renderer-handlers'
import { clearAllData } from '@main/lib/cleaner'
import { createEmitter } from '@marchen/electron-ipc/main'

import { dialog } from 'electron'
import { getMainWindow } from './main'

/**
 * 获取 main → renderer 的事件发射器
 * 通过 createEmitter 创建，替代原来的 getRendererHandlers
 */
export const getRendererHandlers = () => {
  const mainWindow = getMainWindow()
  if (!mainWindow) {
    return
  }
  return createEmitter<RendererHandlers>(mainWindow.webContents)
}

/** 打开设置窗口，可选指定要显示的 tab */
export const createSettingWindow = (tab?: string) => {
  const handlers = getRendererHandlers()
  handlers?.showSetting.send(tab)
}

/** 通知 renderer 导入动画文件 */
export const importAnime = () => {
  const handlers = getRendererHandlers()
  handlers?.importAnime.send()
}

/** 清除应用全部数据（需用户确认） */
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

/** 向 renderer 推送更新进度 */
export const updateProgress = (params: {
  progress: number
  status: 'downloading' | 'installing'
}) => {
  const handlers = getRendererHandlers()
  handlers?.updateProgress.send({ progress: params.progress, status: params.status })
}
