import type { DiagnosticLogEntry, DiagnosticLogLevel } from './types'

/** 单行上限；超出时丢弃 data，只保留截断后的预览，保证一行仍是合法 JSON */
export const MAX_LINE_LENGTH = 8 * 1024
const DATA_PREVIEW_LENGTH = 4 * 1024

/** Error 默认序列化为 {}，这里展开为可读字段；BigInt 等不可序列化值转为字符串 */
const replacer = (_key: string, value: unknown) => {
  if (value instanceof Error)
    return { name: value.name, message: value.message, stack: value.stack }
  if (typeof value === 'bigint') return value.toString()
  return value
}

const stringify = (value: unknown): string => {
  try {
    return JSON.stringify(value, replacer) ?? 'null'
  } catch {
    // 循环引用等异常：退化为字符串，宁可信息少也不能丢整行
    return JSON.stringify(String(value))
  }
}

/** 把结构化记录序列化为一行 JSON；超长时截断 data 并标记 truncated */
export function serializeEntry(entry: DiagnosticLogEntry): string {
  const line = stringify(entry)
  if (line.length <= MAX_LINE_LENGTH) return line
  const { data, ...rest } = entry
  return stringify({
    ...rest,
    truncated: true,
    data: stringify(data).slice(0, DATA_PREVIEW_LENGTH),
  })
}

const LEVELS: Record<string, DiagnosticLogLevel> = {
  error: 'error',
  warn: 'warn',
  info: 'info',
  verbose: 'debug',
  debug: 'debug',
  silly: 'debug',
}

/**
 * electron-log 收到的非结构化输入（如 electron-updater 通过 autoUpdater.logger 写入的文本）
 * 包装为合法记录，避免破坏 JSON Lines 格式。
 */
export function fromPlainLog(level: string, data: unknown[], date: Date): DiagnosticLogEntry {
  const text = data.map((item) => (typeof item === 'string' ? item : stringify(item))).join(' ')
  return {
    t: date.toISOString(),
    lv: LEVELS[level] ?? 'info',
    src: 'main',
    cat: 'updater',
    msg: text,
  }
}
