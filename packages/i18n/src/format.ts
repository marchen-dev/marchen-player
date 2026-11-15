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

const dateFormatters = new Map<string, Intl.DateTimeFormat>()

/** 日期的呈现方式：只有日期，或日期加时间 */
export type DateStyle = 'date' | 'datetime'

const DATE_OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  date: { year: 'numeric', month: 'short', day: 'numeric' },
  datetime: { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
}

/** 按界面语言格式化日期；无效的日期返回空字符串，由调用方决定显示什么 */
export function formatDate(
  value: Date | number | string,
  language: RuntimeLanguage,
  style: DateStyle = 'date',
): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const tag = toLanguageTag(language)
  const key = `${tag}:${style}`
  let formatter = dateFormatters.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(tag, DATE_OPTIONS[style])
    dateFormatters.set(key, formatter)
  }
  return formatter.format(date)
}
