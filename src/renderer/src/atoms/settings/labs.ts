import { useAtom, useAtomValue } from 'jotai'

import { createSettingATom } from './helper'

/**
 * 实验室功能开关。只在用户手动切换后写入存储，未改过的用户跟随这里的默认值。
 * 与常规应用设置分开存储，功能转正时直接删除对应字段并改为常驻入口。
 */
const createLabsDefaultSettings = () => {
  return {
    /** 首页显示“通过 URL 播放”入口，默认开启；不影响已有远程记录的续播与恢复 */
    remoteUrlPlayback: true,
  }
}

export const labsSettingAtom = createSettingATom('labs', createLabsDefaultSettings)

export const useLabsSettings = () => useAtom(labsSettingAtom)
export const useLabsSettingsValue = () => useAtomValue(labsSettingAtom)
