import type { AppSettingsSection, RendererHandlers } from '@marchen/shared/types/renderer-handlers'
import { clearAllData } from '@main/lib/cleaner'
import { t } from '@main/lib/i18n'
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

/** 通知 renderer 打开反馈弹窗 */
export const openFeedback = () => {
  getRendererHandlers()?.openFeedback.send()
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
    await dialog.showMessageBox({ type: 'error', message: t('main:dialog.clearDataFailed') })
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
    message: t('main:dialog.clearDataConfirm'),
    buttons: [t('common:action.cancel'), t('main:dialog.clearDataOk')],
  })
  if (!result.response) {
    return
  }

  return performClearData()
}
