import type { LanguagePreference } from '@marchen/i18n'
import type { NewFeatureId } from '@renderer/lib/new-features'
import { normalizeLanguagePreference, SYSTEM_PREFERENCE } from '@marchen/i18n'
import { normalizeApiRouteMode } from '@renderer/request/api-route-client'
import { useAtom, useAtomValue } from 'jotai'

import { jotaiStore } from '../store'
import { createSettingATom } from './helper'

const createAppDefaultSettings = () => {
  return {
    launchAtLogin: false,
    firstOpen: true,
    apiRouteMode: normalizeApiRouteMode('auto'),
    /** 反馈时是否附带诊断日志，记住用户上次选择 */
    feedbackAttachLogs: true,
    /** 用户已经用过、不再显示「New」标记的功能 ID，见 lib/new-features.ts */
    seenNewFeatures: [] as string[],
    /** 界面语言偏好；实际使用的语言由 initialize/i18n.ts 结合系统语言解析 */
    language: SYSTEM_PREFERENCE as LanguagePreference,
    /**
     * 用户是否对弹幕翻译做过选择（在加载提示里点了「翻译」或「不用」，或在设置里操作过下拉框）。
     * 还没选过、界面又不是中文时，弹幕加载完成的提示里会问一次。
     */
    danmakuTranslationPrompt: 'pending' as 'pending' | 'answered',
    /**
     * 不要自动预下载翻译资源：用户清除过翻译模型，或在询问里选了「不用」。
     * 用户主动开启翻译时清掉。
     */
    translationPreloadOptOut: false,
  }
}

// 读取时补齐默认值：旧版本保存的设置缺少新增字段（如 feedbackAttachLogs），
// 不补齐会读成 undefined，导致默认开启的选项显示为关闭
export const appSettingAtom = createSettingATom('app', createAppDefaultSettings, (settings) => ({
  ...createAppDefaultSettings(),
  ...settings,
  apiRouteMode: normalizeApiRouteMode(settings.apiRouteMode),
  seenNewFeatures: Array.isArray(settings.seenNewFeatures)
    ? settings.seenNewFeatures.filter((id): id is string => typeof id === 'string')
    : [],
  language: normalizeLanguagePreference(settings.language),
  danmakuTranslationPrompt:
    settings.danmakuTranslationPrompt === 'answered' ? ('answered' as const) : ('pending' as const),
  translationPreloadOptOut: settings.translationPreloadOptOut === true,
}))

/** 记下用户已经对弹幕翻译做过选择，之后不再询问 */
export const markTranslationPromptAnswered = (): void => {
  if (jotaiStore.get(appSettingAtom).danmakuTranslationPrompt === 'answered') return
  jotaiStore.set(appSettingAtom, (current) => ({
    ...current,
    danmakuTranslationPrompt: 'answered',
  }))
}

/** 设置或清除「不要自动预下载翻译资源」 */
export const setTranslationPreloadOptOut = (optOut: boolean): void => {
  if (jotaiStore.get(appSettingAtom).translationPreloadOptOut === optOut) return
  jotaiStore.set(appSettingAtom, (current) => ({ ...current, translationPreloadOptOut: optOut }))
}

/** 记下用户已经用过某个新功能，对应的「New」标记从此不再显示 */
export const markNewFeatureSeen = (feature: NewFeatureId): void => {
  if (jotaiStore.get(appSettingAtom).seenNewFeatures.includes(feature)) return
  jotaiStore.set(appSettingAtom, (current) => ({
    ...current,
    seenNewFeatures: [...current.seenNewFeatures, feature],
  }))
}

export const useAppSettings = () => useAtom(appSettingAtom)
export const useAppSettingsValue = () => useAtomValue(appSettingAtom)
