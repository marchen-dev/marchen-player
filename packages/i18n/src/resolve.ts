import type { LanguagePreference, RuntimeLanguage } from './languages'
import { PSEUDO_LANGUAGE, SOURCE_LANGUAGE, SYSTEM_PREFERENCE } from './languages'

export interface ResolveLanguageOptions {
  /** 当前环境是否允许切换语言，见 isLanguageSwitchEnabled */
  switchEnabled: boolean
  /** 是否允许伪本地化（仅开发态）；不允许时该偏好按「跟随系统」处理 */
  pseudoEnabled?: boolean
}

/**
 * 「跟随系统」的解析：按系统首选语言的顺序，取第一个中文或英文。
 * 中文不分简繁体与地区，一律用简体中文；两者都没有时用英文，
 * 因为看不懂中文的用户用英文界面至少能认出常见词。
 */
const fromSystemLanguages = (systemLanguages: readonly string[]): RuntimeLanguage => {
  for (const tag of systemLanguages) {
    const primary = tag.trim().toLowerCase().split(/[-_]/)[0]
    if (primary === 'zh') return 'zh-CN'
    if (primary === 'en') return 'en'
  }
  return 'en'
}

/** 由偏好与系统首选语言得出实际使用的语言；main 与 renderer 共用，保证两边结论一致 */
export function resolveLanguage(
  preference: LanguagePreference,
  systemLanguages: readonly string[],
  options: ResolveLanguageOptions,
): RuntimeLanguage {
  // 未放开时一律用源语言：忽略系统语言，也忽略此前（例如开发态）保存过的偏好
  if (!options.switchEnabled) return SOURCE_LANGUAGE
  if (preference === PSEUDO_LANGUAGE) {
    return options.pseudoEnabled ? PSEUDO_LANGUAGE : fromSystemLanguages(systemLanguages)
  }
  if (preference === SYSTEM_PREFERENCE) return fromSystemLanguages(systemLanguages)
  return preference
}
