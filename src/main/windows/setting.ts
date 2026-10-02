import type { AppSettingsSection, RendererHandlers } from '@marchen/shared/types/renderer-handlers'
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

/** 打开设置窗口，可选指定稳定分类 ID。 */
export const createSettingWindow = (section?: AppSettingsSection) => {
  const handlers = getRendererHandlers()
  handlers?.showSetting.send(section)
}

/** 通知 renderer 导入动画文件 */
export const importAnime = () => {
  const handlers = getRendererHandlers()
  handlers?.importAnime.send()
}

/**
 * 清除应用全部数据，不弹确认。
 * 供已在 renderer 完成确认的设置页「重置应用」调用；失败时仍弹错误对话框。
 */
export const performClearData = async () => {
  if (!getMainWindow()) return
  try {
    return await clearAllData()
  } catch {
    await dialog.showMessageBox({ type: 'error', message: '清除失败，请检查磁盘空间和权限后重试' })
  }
}

/** 清除应用全部数据（需用户确认）；应用菜单「清除数据」入口使用，这里是唯一一次确认 */
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

  return performClearData()
}
