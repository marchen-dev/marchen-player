import type { EnginePreference } from '@renderer/services/player-runtime/engine-policy'
import { setPlayFirstReader } from '@renderer/services/player-loading/play-first-policy'
import {
  DANMAKU_FONT_SCALE,
  DEFAULT_DANMAKU_DISPLAY_AREA,
  DEFAULT_DANMAKU_DURATION,
  normalizeDanmakuAppearance,
} from '@renderer/services/player-runtime/danmaku/appearance'
import {
  createDefaultDanmakuBlockSettings,
  normalizeDanmakuBlockSettings,
} from '@renderer/services/player-runtime/danmaku/danmaku-block-settings'
import { normalizeDanmakuOpacity } from '@renderer/services/player-runtime/danmaku/opacity'
import { normalizeEnginePreference } from '@renderer/services/player-runtime/engine-policy'
import { normalizeSubtitleScale } from '@renderer/services/player-runtime/subtitles/font-scale'
import {
  createDefaultDanmakuTranslationSettings,
  normalizeDanmakuTranslationSettings,
} from '@renderer/services/translation/settings'
import { useAtom, useAtomValue } from 'jotai'

import { jotaiStore } from '../store'
import { createSettingATom } from './helper'

const createPlayerDefaultSettings = () => {
  return {
    enginePreference: 'auto' as EnginePreference,
    subtitleScale: 100,
    enableTraditionalToSimplified: false,
    enableAutomaticEpisodeSwitching: false,
    // 优先播放：导入后先开播，匹配与在线弹幕在后台接入；默认关闭以保证开头弹幕完整
    enablePlayFirst: false,
    enableDanmaku: true,
    danmakuOpacity: 100,
    enableMiniProgress: true,
    // 默认允许单击画面切换播放 / 暂停；已保存的用户选择由设置归一化保留。
    enableClickToTogglePlay: true,
    controllerPosition: { xRatio: 0.5, yRatio: 0.72 },
    // 字号是百分比（100% = 26px）；旧版保存的像素字段 danmakuFontSize 在归一化时迁移
    danmakuFontScale: DANMAKU_FONT_SCALE.default as number,
    // 一条弹幕滚过屏幕的毫秒数，界面上按「弹幕速度」五档呈现
    danmakuDuration: DEFAULT_DANMAKU_DURATION as string,
    danmakuEndArea: DEFAULT_DANMAKU_DISPLAY_AREA as string,
    // 全局屏蔽规则，对所有视频与弹幕来源生效；只影响显示，不改写缓存与 HISTORY 中的弹幕
    danmakuBlock: createDefaultDanmakuBlockSettings(),
    // 弹幕翻译：全局开关与目标语言；只影响显示，不改写缓存与 HISTORY 中的弹幕
    danmakuTranslation: createDefaultDanmakuTranslationSettings(),
  }
}

const playerSettingAtom = createSettingATom('player', createPlayerDefaultSettings, (settings) => ({
  // 外观字段迁移并删掉不再使用的旧字段（像素字号、在屏密度），其余字段原样合并。
  // 字号不能先被默认值填上，否则旧版的像素字段永远轮不到迁移
  ...normalizeDanmakuAppearance({
    ...createPlayerDefaultSettings(),
    ...settings,
    danmakuFontScale: settings?.danmakuFontScale,
  }),
  enginePreference: normalizeEnginePreference(settings?.enginePreference),
  subtitleScale: normalizeSubtitleScale(settings?.subtitleScale),
  danmakuOpacity: normalizeDanmakuOpacity(settings?.danmakuOpacity),
  danmakuBlock: normalizeDanmakuBlockSettings(settings?.danmakuBlock),
  danmakuTranslation: normalizeDanmakuTranslationSettings(settings?.danmakuTranslation),
}))

// 加载服务每次加载开始时读取最新偏好，播放中切换只影响下一次加载
setPlayFirstReader(() => jotaiStore.get(playerSettingAtom).enablePlayFirst)

export { playerSettingAtom }
export const usePlayerSettings = () => useAtom(playerSettingAtom)
export const usePlayerSettingsValue = () => useAtomValue(playerSettingAtom)
