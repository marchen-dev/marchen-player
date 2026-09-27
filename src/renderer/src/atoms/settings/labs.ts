import { useAtom, useAtomValue } from 'jotai'

import { createSettingATom } from './helper'

/**
 * 实验室功能开关，全部默认关闭。
 * 与常规应用设置分开存储，功能转正时直接删除对应字段并改为常驻入口。
 */
const createLabsDefaultSettings = () => {
  return {
    /** 首页显示“通过 URL 播放”入口；不影响已有远程记录的续播与恢复 */
    remoteUrlPlayback: false,
  }
}

export const labsSettingAtom = createSettingATom('labs', createLabsDefaultSettings)

export const useLabsSettings = () => useAtom(labsSettingAtom)
export const useLabsSettingsValue = () => useAtomValue(labsSettingAtom)
