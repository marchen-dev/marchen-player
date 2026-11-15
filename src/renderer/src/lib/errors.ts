/**
 * 把一次失败变成给用户看的一句话，语言与界面一致。
 *
 * 显示错误信息的地方统一用 `describeError`，不要直接显示 `error.message`：
 * 错误的 message 始终是简体中文（用于日志），英文界面不能直接拿来显示。
 *
 * 规则（按顺序）：
 * 1. 界面是简体中文：显示错误原来的中文说明——与引入多语言之前完全一致；
 *    错误没有带说明时，按错误码取文案；
 * 2. 其他语言、错误带错误码且 errors 命名空间里有对应文案：显示该语言的文案；
 * 3. 其他语言、没有对应文案：显示调用方给的概括说明；原始说明不含汉字时
 *    （浏览器、系统给出的英文错误）附在后面；
 * 4. 什么都取不到：显示概括说明。
 *
 * 简体中文优先用原说明而不是错误码对应的文案，是因为多处具体的失败会合并到同一个错误码
 * （例如各平台的「网络请求失败」），原说明更具体，也保证中文界面的文字不因多语言而变化。
 */
import type { UserErrorParams } from '@marchen/shared/errors'
import { SOURCE_LANGUAGE } from '@marchen/i18n'
import { decodeUserError, isUserError } from '@marchen/shared/errors'
import { getLanguage, i18n } from './i18n'

const HAN = /\p{Script=Han}/u

export interface DescribeErrorOptions {
  /**
   * 错误码没有域前缀时属于哪个域。媒体源、翻译资源等已有的错误码是裸的（如 `auth_failed`），
   * 给出域之后按 `errors:<域>.<错误码>` 查文案。`UserError` 的错误码自带域，不需要这个参数。
   */
  domain?: string
}

interface ResolvedError {
  code?: string
  params?: UserErrorParams
  /** 简体中文说明（或原始错误文字） */
  message: string
}

const readMessage = (error: unknown): string => {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const { message } = error as { message?: unknown }
    if (typeof message === 'string') return message
  }
  return ''
}

const resolve = (error: unknown, domain?: string): ResolvedError => {
  if (isUserError(error)) return { code: error.code, params: error.params, message: error.message }
  const raw = readMessage(error)
  // 穿过只能传文字的边界后（进程间调用、保存在本机的失败原因），错误码编码在文字里
  const decoded = decodeUserError(raw)
  if (decoded) return decoded
  const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined
  if (typeof code === 'string' && code) {
    const { params } = error as { params?: UserErrorParams }
    // 结果对象上的错误码若已带域（`域.原因`）直接使用；裸错误码需要调用方给出域
    if (code.includes('.')) return { code, params, message: raw }
    if (domain) return { code: `${domain}.${code}`, params, message: raw }
  }
  return { message: raw }
}

/**
 * 失败的具体说明，取不到适合当前语言显示的内容时返回 null。
 * 用在「概括 + 细节」由调用方自己排版的地方（例如「匹配失败：<细节>」）；
 * 一般的失败提示直接用 describeError。
 */
export function errorDetail(error: unknown, options: DescribeErrorOptions = {}): string | null {
  const { code, params, message } = resolve(error, options.domain)
  const source = getLanguage() === SOURCE_LANGUAGE
  // 简体中文界面优先显示原来的中文说明
  if (source && message) return message
  if (code && i18n.exists(`errors:${code}`)) {
    // 错误码来自运行时，类型系统管不到；是否有文案由 scripts/i18n 下的测试保证
    const translate = i18n.t as unknown as (key: string, options?: UserErrorParams) => string
    return translate(`errors:${code}`, params)
  }
  // 其他语言只显示不含汉字的原始说明（浏览器、系统给出的英文错误）
  return message && !HAN.test(message) ? message : null
}

/**
 * @param error    捕获到的错误、带 `code` / `message` 的结果对象，或保存下来的错误文字
 * @param fallback 这是在做什么操作时失败的（已按当前语言取好的概括说明），必填
 */
export function describeError(
  error: unknown,
  fallback: string,
  options: DescribeErrorOptions = {},
): string {
  const { code, params, message } = resolve(error, options.domain)
  const source = getLanguage() === SOURCE_LANGUAGE
  if (source && message) return message
  if (code && i18n.exists(`errors:${code}`)) {
    const translate = i18n.t as unknown as (key: string, options?: UserErrorParams) => string
    return translate(`errors:${code}`, params)
  }
  if (!source && message && message !== fallback && !HAN.test(message)) {
    return i18n.t('errors:generic.withDetail', { summary: fallback, detail: message })
  }
  return fallback
}

/** 错误是否带有指定的错误码（含域前缀）；用它判断是哪一种失败，不要匹配错误文字 */
export const hasErrorCode = (error: unknown, code: string): boolean => resolve(error).code === code
