import type { DiagnosticLogEntry, DiagnosticLogInput } from './types'
import fs from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

import { app } from 'electron'
import logger from 'electron-log'

import { isDev } from '../env'
import { fromPlainLog, serializeEntry } from './format'
import { createLogThrottle } from './throttle'

export type { DiagnosticLogEntry, DiagnosticLogInput, DiagnosticLogLevel } from './types'

const LOG_FILE = 'marchen.log'
/** 单文件上限；当前 + 两份历史，总量约 15 MB */
const MAX_FILE_SIZE = 5 * 1024 * 1024
const HISTORY_FILES = 2

/** 标记 writeLog 写入的结构化记录，与第三方直接调用 electron-log 的纯文本区分 */
class StructuredLog {
  constructor(readonly entry: DiagnosticLogEntry) {}
}

/**
 * 日志目录：正式版用系统惯用位置（macOS ~/Library/Logs/Marchen，Windows %APPDATA%\Marchen\logs）；
 * 开发版放进已隔离的 userData（appData 为 Marchen (dev)），避免与正式版混写。
 */
export const logDirectory = () =>
  isDev ? path.join(app.getPath('userData'), 'logs') : app.getPath('logs')

const historyPath = (file: string, index: number) => {
  const { dir, name, ext } = path.parse(file)
  return path.join(dir, `${name}.${index}${ext}`)
}

const allLogFiles = () => {
  const current = path.join(logDirectory(), LOG_FILE)
  // 由旧到新排列，打包时拼接顺序即时间顺序
  return [
    ...Array.from({ length: HISTORY_FILES }, (_, i) => historyPath(current, HISTORY_FILES - i)),
    current,
  ]
}

let configured = false

/**
 * 配置 electron-log 文件输出。幂等，且在首次写日志时自动调用：
 * 进程最早期的异常可能早于 initializeApp，仍要写到正确位置。
 */
export function configureDiagnosticLog() {
  if (configured) return
  configured = true
  const file = logger.transports.file
  file.maxSize = MAX_FILE_SIZE
  file.resolvePathFn = () => path.join(logDirectory(), LOG_FILE)
  // electron-log 默认只保留一份 .old；这里滚动保留两份历史：当前 → .1 → .2 → 删除
  file.archiveLogFn = (current) => {
    const currentPath = current.toString()
    try {
      fs.rmSync(historyPath(currentPath, HISTORY_FILES), { force: true })
      for (let i = HISTORY_FILES - 1; i >= 1; i--) {
        const from = historyPath(currentPath, i)
        if (fs.existsSync(from)) fs.renameSync(from, historyPath(currentPath, i + 1))
      }
      fs.renameSync(currentPath, historyPath(currentPath, 1))
    } catch {
      // 改名失败（如文件被占用）时只保留末尾 256 KB，至少不让文件无限增长；
      // crop 是 electron-log 运行时方法（默认轮转同样使用），类型声明未包含
      const croppable = current as typeof current & { crop?: (bytes: number) => void }
      if (croppable.crop) croppable.crop(256 * 1024)
      else current.clear()
    }
  }
  const format = ({ message }: { message: { data: unknown[]; level: string; date: Date } }) => {
    const [first] = message.data
    const entry =
      first instanceof StructuredLog
        ? first.entry
        : fromPlainLog(message.level, message.data, message.date)
    return [serializeEntry(entry)]
  }
  file.format = format
  logger.transports.console.format = format
  // 正式版终端输出无人查看，关闭以减少开销
  if (!isDev) logger.transports.console.level = false
}

const throttle = createLogThrottle((entry) => {
  try {
    configureDiagnosticLog()
    logger[entry.lv](new StructuredLog(entry))
  } catch (error) {
    // 写日志自身失败只打印到终端，绝不再经遥测上报，避免递归
    console.warn('[diagnostic-log] 写入失败', error)
  }
})

// 合并窗口需要定时结束，否则长时间无新日志时重复计数不会写出
setInterval(() => throttle.tick(), 10_000).unref()

/** 写入一条诊断日志；src 默认 main，t 默认当前时刻 */
export function writeLog(input: DiagnosticLogInput): void {
  try {
    throttle.push({ ...input, t: input.t ?? new Date().toISOString(), src: input.src ?? 'main' })
  } catch (error) {
    console.warn('[diagnostic-log] 写入失败', error)
  }
}

/** 立即写出待补的重复计数，用于退出前 */
export const flushDiagnosticLog = () => throttle.flush()

/** 读取全部日志（旧到新）并 gzip 压缩，作为反馈附件 */
export function collectDiagnostics(): Uint8Array {
  throttle.flush()
  const content = allLogFiles()
    .filter((file) => fs.existsSync(file))
    .map((file) => fs.readFileSync(file))
  return gzipSync(Buffer.concat(content))
}

/** 清空日志：删除历史文件、截断当前文件（electron-log 持有句柄，不直接删除） */
export function clearLogs(): void {
  throttle.flush()
  try {
    configureDiagnosticLog()
    const [current] = allLogFiles().slice(-1)
    for (const file of allLogFiles()) if (file !== current) fs.rmSync(file, { force: true })
    logger.transports.file.getFile().clear()
  } catch (error) {
    console.warn('[diagnostic-log] 清空失败', error)
  }
}
