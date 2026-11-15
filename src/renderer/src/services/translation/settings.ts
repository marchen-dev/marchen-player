/**
 * 弹幕翻译的设置形状与归一化。
 *
 * 设置 atom 在应用启动时就会读取并归一化存档，这里只依赖清单里的常量，
 * 不引入引擎、Worker 或 OpenCC，避免未开启翻译的用户承担加载开销。
 */
import type { TranslationTarget } from './assets/manifest'
import { DEFAULT_TRANSLATION_TARGET, TRANSLATION_PAIRS, translationPairId } from './assets/manifest'

export interface DanmakuTranslationSettings {
  /** 全局偏好，对所有视频与弹幕来源生效，不写入单视频 HISTORY */
  enabled: boolean
  /** 目标语言。当前界面不提供选择，固定英文；保留字段是为了以后可跟随界面语言 */
  target: TranslationTarget
}

export const createDefaultDanmakuTranslationSettings = (): DanmakuTranslationSettings => ({
  enabled: false,
  target: DEFAULT_TRANSLATION_TARGET,
})

const isKnownTarget = (value: unknown): value is TranslationTarget =>
  typeof value === 'string' && translationPairId(value as TranslationTarget) in TRANSLATION_PAIRS

/** 旧存档缺字段、字段类型不对或目标语言已不存在时回落到默认值 */
export const normalizeDanmakuTranslationSettings = (value: unknown): DanmakuTranslationSettings => {
  const candidate = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    enabled: candidate.enabled === true,
    target: isKnownTarget(candidate.target) ? candidate.target : DEFAULT_TRANSLATION_TARGET,
  }
}
