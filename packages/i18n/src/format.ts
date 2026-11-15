import type { RuntimeLanguage } from './languages'
import { toLanguageTag } from './languages'

/** Intl 格式化器创建开销不小，按语言缓存 */
const numberFormatters = new Map<string, Intl.NumberFormat>()

/** 按界面语言格式化数量（带千分位分隔），用于弹幕条数这类会上千的数字 */
export function formatNumber(value: number, language: RuntimeLanguage): string {
  const tag = toLanguageTag(language)
  let formatter = numberFormatters.get(tag)
  if (!formatter) {
    formatter = new Intl.NumberFormat(tag)
    numberFormatters.set(tag, formatter)
  }
  return formatter.format(value)
}
