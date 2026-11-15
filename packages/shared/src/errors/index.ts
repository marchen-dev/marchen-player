/**
 * 带稳定错误码的「用户错误」：会显示给用户、并且用户看了能明白发生了什么的失败。
 *
 * 这里是纯 TS，不依赖界面多语言：错误只带错误码与参数，界面按错误码取对应语言的文案
 * （renderer 的 `describeError`）。`message` 始终是简体中文，用于日志与遥测，
 * 也是简体中文界面在没有专门文案时的兜底。
 *
 * 约定：
 * - 错误码形如 `域.原因`，同时就是 `packages/i18n` 里 errors 命名空间的键；
 * - 解析器、解码器这类内部校验不要用它，继续 `new Error('中文')`：它们不翻译，
 *   英文界面只显示一句概括说明。
 */

/** 文案里的可变内容：状态码、数量、文件名等 */
export type UserErrorParams = Record<string, string | number>

export interface UserErrorPayload {
  code: string
  params?: UserErrorParams
  /** 简体中文说明 */
  message: string
}

export class UserError extends Error implements UserErrorPayload {
  readonly code: string
  readonly params?: UserErrorParams

  constructor(
    code: string,
    message: string,
    params?: UserErrorParams,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'UserError'
    this.code = code
    this.params = params
  }
}

/** 跨模块边界后 `instanceof` 可能失效（不同的打包产物），同时按形状判断 */
export const isUserError = (value: unknown): value is UserError =>
  value instanceof UserError ||
  (value instanceof Error &&
    value.name === 'UserError' &&
    typeof (value as { code?: unknown }).code === 'string')

/**
 * 编码标记。错误要穿过只能传文字的边界时（Electron 的进程间调用会丢掉错误的自定义字段，
 * 下载任务的失败原因以字符串保存在状态文件里），把错误码与参数编码在文字开头：
 *
 *   ⟦域.原因|{"status":503}⟧简体中文说明
 *
 * 后面仍带着中文说明，直接出现在日志里也能读。这两个括号不会出现在正常的错误信息里。
 */
const OPEN = '⟦'
const CLOSE = '⟧'
const CODE = /^[\w.-]+$/

export const encodeUserError = (error: UserErrorPayload): string => {
  const params =
    error.params && Object.keys(error.params).length > 0
      ? // 参数值里若含结束标记（例如文件名），转成 JSON 的转义形式，保证标记只出现一次
        `|${JSON.stringify(error.params).replaceAll(CLOSE, '\\u27E7')}`
      : ''
  return `${OPEN}${error.code}${params}${CLOSE}${error.message}`
}

const isParams = (value: unknown): value is UserErrorParams =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((item) => typeof item === 'string' || typeof item === 'number')

/**
 * 从一段文字里取出编码过的用户错误；不含标记或格式不对时返回 null，由调用方按普通文字处理。
 * 标记不必在开头：Electron 会在跨进程的错误文字前加一段固定前缀。
 */
export const decodeUserError = (text: unknown): UserErrorPayload | null => {
  if (typeof text !== 'string') return null
  const start = text.indexOf(OPEN)
  if (start === -1) return null
  const end = text.indexOf(CLOSE, start)
  if (end === -1) return null
  const inner = text.slice(start + 1, end)
  const separator = inner.indexOf('|')
  const code = separator === -1 ? inner : inner.slice(0, separator)
  if (!CODE.test(code)) return null
  const message = text.slice(end + 1)
  if (separator === -1) return { code, message }
  try {
    const params: unknown = JSON.parse(inner.slice(separator + 1))
    return isParams(params) ? { code, params, message } : null
  } catch {
    return null
  }
}

/** 把解码结果还原成错误对象 */
export const toUserError = (payload: UserErrorPayload): UserError =>
  new UserError(payload.code, payload.message, payload.params)

/**
 * 把一段错误文字还原成错误对象：带编码标记的还原为 UserError，其余是普通 Error。
 * 用在只能传文字的边界的接收端（下载子进程的应答、保存在本机的失败原因）。
 */
export const errorFromText = (text: string): Error => {
  const payload = decodeUserError(text)
  return payload ? toUserError(payload) : new Error(text)
}

/**
 * 错误变成可以保存或跨进程传递的文字：用户错误带上编码标记，其余只取说明。
 * 与 errorFromText 成对使用。
 */
export const errorToText = (error: unknown, fallback: string): string => {
  if (isUserError(error)) return encodeUserError(error)
  return error instanceof Error && error.message ? error.message : fallback
}

/**
 * 进程间调用返回的失败结果。`message` 是简体中文说明；能归到某个错误码时带上 `code`，
 * 页面据此显示对应语言的文案。
 */
export interface FailureResult {
  ok: false
  message: string
  code?: string
  params?: UserErrorParams
}

/** 把捕获到的错误变成失败结果；不是 Error 时用 fallback 作为说明 */
export const toFailureResult = (error: unknown, fallback: string): FailureResult => {
  if (isUserError(error)) {
    return {
      ok: false,
      message: error.message,
      code: error.code,
      ...(error.params ? { params: error.params } : {}),
    }
  }
  return { ok: false, message: error instanceof Error && error.message ? error.message : fallback }
}

/** 把失败结果还原成错误：带错误码的还原为 UserError，其余是普通 Error */
export const errorFromFailure = (
  failure: { message?: string; code?: string; params?: UserErrorParams } | null | undefined,
  fallback: string,
): Error => {
  const message = failure?.message || fallback
  return failure?.code ? new UserError(failure.code, message, failure.params) : new Error(message)
}
