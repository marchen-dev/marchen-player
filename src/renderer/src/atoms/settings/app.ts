import { normalizeApiRouteMode } from '@renderer/request/api-route-client'
import { useAtom, useAtomValue } from 'jotai'

import { createSettingATom } from './helper'

const createAppDefaultSettings = () => {
  return {
    launchAtLogin: false,
    firstOpen: true,
    apiRouteMode: normalizeApiRouteMode('auto'),
    /** 反馈时是否附带诊断日志，记住用户上次选择 */
    feedbackAttachLogs: true,
  }
}

// 读取时补齐默认值：旧版本保存的设置缺少新增字段（如 feedbackAttachLogs），
// 不补齐会读成 undefined，导致默认开启的选项显示为关闭
export const appSettingAtom = createSettingATom('app', createAppDefaultSettings, (settings) => ({
  ...createAppDefaultSettings(),
  ...settings,
  apiRouteMode: normalizeApiRouteMode(settings.apiRouteMode),
}))

export const useAppSettings = () => useAtom(appSettingAtom)
export const useAppSettingsValue = () => useAtomValue(appSettingAtom)
