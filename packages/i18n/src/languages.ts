/**
 * 界面语言的定义。
 *
 * 三个容易混淆的概念：
 * - 偏好（LanguagePreference）：用户在设置里选的值，可以是「跟随系统」；
 * - 界面语言（AppLanguage）：正式支持的语言，简体中文是源语言；
 * - 运行语言（RuntimeLanguage）：实例当前实际使用的语言，开发态多一个伪本地化。
 */

/** 正式支持的界面语言，顺序即设置里的显示顺序 */
export const APP_LANGUAGES = ['zh-CN', 'en'] as const
export type AppLanguage = (typeof APP_LANGUAGES)[number]

/** 源语言：文案以它为准，其他语言缺失时回退到它 */
export const SOURCE_LANGUAGE = 'zh-CN' satisfies AppLanguage

/** 伪本地化：只在开发态存在，用来找未迁移的文字与布局溢出，见 pseudo.ts */
export const PSEUDO_LANGUAGE = 'pseudo'
export type RuntimeLanguage = AppLanguage | typeof PSEUDO_LANGUAGE

export const SYSTEM_PREFERENCE = 'system'
export type LanguagePreference = typeof SYSTEM_PREFERENCE | RuntimeLanguage

/**
 * 各语言的自称名：下拉框里始终这样显示，不随界面语言变化，
 * 看不懂当前界面语言的用户也能认出自己的语言。
 */
export const LANGUAGE_NATIVE_NAMES: Record<RuntimeLanguage, string> = {
  'zh-CN': '简体中文',
  en: 'English',
  pseudo: 'Pseudo',
}

/**
 * 发布开关：界面多语言是否已对正式构建放开。
 *
 * 界面迁移分多个变更进行，全部完成前正式构建固定显示简体中文、不显示语言选项，
 * 避免线上出现「一半英文一半中文」。全部界面已迁移，1.1.8 起放开：正式构建跟随系统语言，
 * 设置里有语言选项。常量保留是为了万一需要整体回退时只改这一处。
 */
export const LANGUAGE_SWITCH_RELEASED = true

/** 当前运行环境是否允许切换界面语言：开发态始终允许，正式构建取决于发布开关 */
export const isLanguageSwitchEnabled = (isDev: boolean): boolean =>
  isDev || LANGUAGE_SWITCH_RELEASED

export const isAppLanguage = (value: unknown): value is AppLanguage =>
  typeof value === 'string' && (APP_LANGUAGES as readonly string[]).includes(value)

export const isRuntimeLanguage = (value: unknown): value is RuntimeLanguage =>
  isAppLanguage(value) || value === PSEUDO_LANGUAGE

/** 旧存档缺字段或值非法时回落到「跟随系统」 */
export const normalizeLanguagePreference = (value: unknown): LanguagePreference =>
  value === SYSTEM_PREFERENCE || isRuntimeLanguage(value) ? value : SYSTEM_PREFERENCE

/** 写进 `<html lang>` 与 Intl 的语言标记；伪本地化的文字是拉丁字母，按英文处理 */
export const toLanguageTag = (language: RuntimeLanguage): AppLanguage =>
  language === PSEUDO_LANGUAGE ? 'en' : language
