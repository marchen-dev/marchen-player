import type { SelectOption } from '@renderer/components/modules/shared/setting/SettingSelect'
import type { EnginePreference } from '@renderer/services/player-runtime/engine-policy'
import {
  danmakuDurationList,
  danmakuEndAreaList,
  danmakuFontSizeList,
} from '@renderer/components/modules/settings/views/player/list'
import { setPlayFirstReader } from '@renderer/services/player-loading/play-first-policy'
import {
  createDefaultDanmakuBlockSettings,
  normalizeDanmakuBlockSettings,
} from '@renderer/services/player-runtime/danmaku/danmaku-block-settings'
import { normalizeDanmakuOpacity } from '@renderer/services/player-runtime/danmaku/opacity'
import { normalizeEnginePreference } from '@renderer/services/player-runtime/engine-policy'
import { normalizeSubtitleScale } from '@renderer/services/player-runtime/subtitles/font-scale'
import { useAtom, useAtomValue } from 'jotai'

import { jotaiStore } from '../store'
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
    // 优先播放：导入后先开播，匹配与在线弹幕在后台接入；默认关闭以保证开头弹幕完整
    enablePlayFirst: false,
    enableDanmaku: true,
    danmakuMaxOnScreen: '80',
    danmakuOpacity: 100,
    enableMiniProgress: true,
    // 单击画面切换播放 / 暂停，默认关闭，避免与只想唤出控制器的点击冲突
    enableClickToTogglePlay: false,
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
  danmakuOpacity: normalizeDanmakuOpacity(settings?.danmakuOpacity),
  danmakuBlock: normalizeDanmakuBlockSettings(settings?.danmakuBlock),
}))

// 加载服务每次加载开始时读取最新偏好，播放中切换只影响下一次加载
setPlayFirstReader(() => jotaiStore.get(playerSettingAtom).enablePlayFirst)

export { playerSettingAtom }
export const usePlayerSettings = () => useAtom(playerSettingAtom)
export const usePlayerSettingsValue = () => useAtomValue(playerSettingAtom)
