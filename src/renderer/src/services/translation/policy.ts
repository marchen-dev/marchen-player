/**
 * 弹幕翻译里几处「要不要做」的判断：预下载、下载确认、首次询问。
 * 全部是纯函数，条件由调用方读好传进来，方便单独测试，也让每条规则有一处明确的出处。
 */
import type { RuntimeLanguage } from '@marchen/i18n'
import type { TranslationTarget } from './assets/manifest'
import { toLanguageTag } from '@marchen/i18n'
import { TRANSLATION_TARGETS } from './assets/manifest'

/**
 * 界面语言对应的翻译目标：存在「译成这门语言」的模型时返回它，否则为 null。
 * 简体中文界面没有（弹幕本来就是中文）；伪本地化按英文处理。
 */
export const translationTargetForLanguage = (
  language: RuntimeLanguage,
): TranslationTarget | null => {
  const tag: string = toLanguageTag(language)
  return TRANSLATION_TARGETS.find((target) => target === tag) ?? null
}

export interface TranslationPreloadConditions {
  /** 界面语言对应的翻译目标，见 translationTargetForLanguage */
  uiTarget: TranslationTarget | null
  /** 当前环境能否运行弹幕翻译 */
  supported: boolean
  /** 本机缺少该目标语言的引擎或模型 */
  assetsMissing: boolean
  /** 用户清除过翻译模型，或在询问里选过「不用」 */
  optOut: boolean
  /** 系统或浏览器处于省流量模式 */
  saveData: boolean
  isWeb: boolean
  /** 本次运行里打开过视频（只对 Web 端有约束） */
  openedVideo: boolean
}

/**
 * 是否在用户开启翻译之前就把翻译资源下载好。
 * Web 端多一个条件：网页可能只是被随手打开，等用户真的打开了视频再下约 50 MB。
 */
export const shouldPreloadTranslation = (conditions: TranslationPreloadConditions): boolean =>
  conditions.uiTarget !== null &&
  conditions.supported &&
  conditions.assetsMissing &&
  !conditions.optOut &&
  !conditions.saveData &&
  (!conditions.isWeb || conditions.openedVideo)

/**
 * 开启翻译、本机又没有资源时，是否先弹下载确认。
 * 界面语言就是要翻译成的语言时不确认（这种情况下资源本来就会预下载）；
 * 省流量模式是例外——此时不预下载，流量由用户自己决定。
 */
export const shouldConfirmTranslationDownload = (conditions: {
  uiTarget: TranslationTarget | null
  target: TranslationTarget
  saveData: boolean
}): boolean => conditions.uiTarget !== conditions.target || conditions.saveData

/** 用户是否对弹幕翻译做过选择 */
export type TranslationPromptState = 'pending' | 'answered'

export interface TranslationPromptConditions {
  uiTarget: TranslationTarget | null
  supported: boolean
  prompt: TranslationPromptState
  /** 弹幕翻译当前已开启：老用户在引入询问之前就开过，视为已经选择 */
  translationEnabled: boolean
  /** 本次运行已经问过 */
  askedThisRun: boolean
  /** 这条提示是「弹幕加载成功」的那一种 */
  loaded: boolean
  /** 加载到的弹幕条数 */
  count: number
}

/** 是否在弹幕加载完成的提示里问一次「要不要把弹幕翻译成界面语言」 */
export const shouldAskDanmakuTranslation = (conditions: TranslationPromptConditions): boolean =>
  conditions.uiTarget !== null &&
  conditions.supported &&
  conditions.prompt === 'pending' &&
  !conditions.translationEnabled &&
  !conditions.askedThisRun &&
  conditions.loaded &&
  conditions.count > 0

/** 省流量模式：只有 Chromium 提供这个信息（Electron 与 Chrome 都有），读不到按「不是」处理 */
export const isSaveDataEnabled = (): boolean => {
  if (typeof navigator === 'undefined') return false
  const { connection } = navigator as Navigator & { connection?: { saveData?: boolean } }
  return connection?.saveData === true
}
