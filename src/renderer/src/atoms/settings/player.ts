import type { SelectOption } from '@renderer/components/modules/shared/setting/SettingSelect'
import type { EnginePreference } from '@renderer/services/player-runtime/engine-policy'
import {
  danmakuDurationList,
  danmakuEndAreaList,
  danmakuFontSizeList,
} from '@renderer/components/modules/settings/views/player/list'
import {
  createDefaultDanmakuBlockSettings,
  normalizeDanmakuBlockSettings,
} from '@renderer/services/player-runtime/danmaku/danmaku-block-settings'
import { normalizeEnginePreference } from '@renderer/services/player-runtime/engine-policy'
import { normalizeSubtitleScale } from '@renderer/services/player-runtime/subtitles/font-scale'
import { useAtom, useAtomValue } from 'jotai'

import { createSettingATom } from './helper'

const getSelectedDefaultValue = (list: SelectOption[]) => {
  return list.find((item) => item.default)?.value
}

const createPlayerDefaultSettings = () => {
  return {
    enginePreference: 'auto' as EnginePreference,
    subtitleScale: 100,
    enableTraditionalToSimplified: false,
    enableAutomaticEpisodeSwitching: false,
    enableDanmaku: true,
    danmakuMaxOnScreen: '80',
    enableMiniProgress: true,
    controllerPosition: { xRatio: 0.5, yRatio: 0.72 },
    danmakuFontSize: getSelectedDefaultValue(danmakuFontSizeList) ?? '26',
    danmakuDuration: getSelectedDefaultValue(danmakuDurationList) ?? '15000',
    danmakuEndArea: getSelectedDefaultValue(danmakuEndAreaList)!,
    // 全局屏蔽规则，对所有视频与弹幕来源生效；只影响显示，不改写缓存与 HISTORY 中的弹幕
    danmakuBlock: createDefaultDanmakuBlockSettings(),
  }
}

const playerSettingAtom = createSettingATom('player', createPlayerDefaultSettings, (settings) => ({
  ...createPlayerDefaultSettings(),
  ...settings,
  enginePreference: normalizeEnginePreference(settings?.enginePreference),
  subtitleScale: normalizeSubtitleScale(settings?.subtitleScale),
  danmakuBlock: normalizeDanmakuBlockSettings(settings?.danmakuBlock),
}))

export { playerSettingAtom }
export const usePlayerSettings = () => useAtom(playerSettingAtom)
export const usePlayerSettingsValue = () => useAtomValue(playerSettingAtom)
