import type {
  CommonTelemetryProperties,
  ErrorContext,
  TelemetryClient,
  TelemetryEventMap,
  TelemetryEventName,
} from './contracts'
import { ipcClient } from '@renderer/lib/client'

import { boundTelemetryValue } from './bound'

export type LocalLogLevel = 'debug' | 'info' | 'warn' | 'error'

/** 与 main 侧 DiagnosticLogEntry 对齐；src 由 main 统一标记为 renderer */
export interface LocalLogEntry {
  t: string
  lv: LocalLogLevel
  cat: string
  msg: string
  op?: string
  data?: unknown
}

/** 公共属性只在环境快照里出现一次，逐条写入会让日志体积翻倍 */
const COMMON_KEYS = new Set<keyof CommonTelemetryProperties>([
  'release',
  'dist',
  'version',
  'commit',
  'environment',
  'app_target',
  'runtime',
  'platform',
  'arch',
  'install_id',
  'app_session_id',
])

/** Web 端内存环形缓冲上限；不持久化，刷新即清空 */
const WEB_BUFFER_LIMIT = 2_000
/** Electron 批量发送：最多攒 1 秒或 50 条 */
const FLUSH_INTERVAL_MS = 1_000
const FLUSH_SIZE = 50

const webBuffer: LocalLogEntry[] = []
/** 最近一次视频导入的操作 ID，供播放失败反馈关联到具体那次操作 */
let lastImportOperationId: string | undefined

export const getLastImportOperationId = () => lastImportOperationId
let pending: LocalLogEntry[] = []
let flushTimer: ReturnType<typeof setTimeout> | undefined

/**
 * 发给 main 写入文件。这里用简单队列而非 RxJS bufferTime：
 * 页面隐藏时需要能主动立即 flush，队列实现更直接。
 */
const flushToMain = () => {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = undefined
  if (pending.length === 0 || !ipcClient) return
  const entries = pending
  pending = []
  ipcClient.app.appendLogs({ entries }).catch((error: unknown) => {
    // 自身失败只打印，绝不再经 telemetry 上报，避免递归
    console.warn('[local-log] 发送日志到主进程失败', error)
  })
}

/** 写入一条本地日志：Electron 交给 main 落盘，Web 进入内存缓冲 */
export function writeLocalLog(input: Omit<LocalLogEntry, 't'> & { t?: string }): void {
  try {
    const entry: LocalLogEntry = {
      ...input,
      t: input.t ?? new Date().toISOString(),
      data: input.data === undefined ? undefined : boundTelemetryValue(input.data).value,
    }
    if (!ipcClient) {
      webBuffer.push(entry)
      if (webBuffer.length > WEB_BUFFER_LIMIT)
        webBuffer.splice(0, webBuffer.length - WEB_BUFFER_LIMIT)
      return
    }
    pending.push(entry)
    if (pending.length >= FLUSH_SIZE) flushToMain()
    else flushTimer ??= setTimeout(flushToMain, FLUSH_INTERVAL_MS)
  } catch (error) {
    console.warn('[local-log] 写入失败', error)
  }
}

/** Web 端反馈附带的最近记录（序列化为 JSON Lines） */
export const readWebLocalLog = () => webBuffer.map((entry) => JSON.stringify(entry)).join('\n')

const stripCommon = (properties: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(properties).filter(
      ([key]) => !COMMON_KEYS.has(key as keyof CommonTelemetryProperties),
    ),
  )

/** 产品事件的日志级别：失败为 error，卡顿与失败结果为 warn，其余 info */
export const levelOfEvent = (name: string, properties: Record<string, unknown>): LocalLogLevel => {
  if (name.endsWith('_failed')) return 'error'
  if (name.includes('stalled')) return 'warn'
  const result = properties.result
  if (result === 'failure' || result === 'failed' || result === 'error') return 'warn'
  return 'info'
}

const categoryOfEvent = (name: string) => {
  if (name.startsWith('download_')) return 'download'
  if (name.startsWith('subtitle_')) return 'subtitle'
  if (name.startsWith('app_') || name === 'page_viewed' || name === 'feature_used') return 'app'
  return 'player'
}

const toLevel = (level?: 'debug' | 'info' | 'warning' | 'error' | 'fatal'): LocalLogLevel =>
  level === 'warning' ? 'warn' : level === 'fatal' ? 'error' : (level ?? 'info')

const describeError = (error: unknown) =>
  error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { message: String(error) }

/**
 * 本地诊断日志 telemetry client：挂入组合客户端，业务代码无需改动即可落地现有事件。
 * 始终启用，不受遥测开关影响；必须排在组合客户端最后，避免成为 tracing owner。
 */
export const createLocalLogTelemetryClient = (): TelemetryClient => ({
  identify: () => {},
  capture<E extends TelemetryEventName>(
    name: E,
    properties: TelemetryEventMap[E] & CommonTelemetryProperties,
  ) {
    const data = stripCommon(properties as unknown as Record<string, unknown>)
    const op = data.operation_id ?? data.attempt_id
    if (name === 'video_import_started' && typeof data.operation_id === 'string') {
      lastImportOperationId = data.operation_id
    }
    writeLocalLog({
      lv: levelOfEvent(name, data),
      cat: categoryOfEvent(name),
      msg: name,
      op: typeof op === 'string' ? op : undefined,
      data,
    })
  },
  captureException(error: unknown, context?: ErrorContext) {
    writeLocalLog({
      lv: context?.level === 'warning' ? 'warn' : 'error',
      cat: context?.mechanism ?? 'error',
      msg: 'exception',
      data: {
        ...describeError(error),
        errorCode: context?.errorCode,
        handled: context?.handled,
        contexts: context?.contexts,
      },
    })
    return undefined
  },
  log(entry) {
    writeLocalLog({ lv: toLevel(entry.level), cat: 'log', msg: entry.message, data: entry.data })
  },
  addBreadcrumb(breadcrumb) {
    writeLocalLog({
      lv: toLevel(breadcrumb.level),
      cat: breadcrumb.category,
      msg: breadcrumb.message,
      data: breadcrumb.data,
    })
  },
  startSpan: (_span, run) => run(),
  async flush() {
    flushToMain()
  },
  async reset() {},
})

let globalHandlersInstalled = false

/**
 * 全局错误监听：Sentry SDK 自动捕获的未处理错误不经过 telemetry client，需单独落地。
 * 页面隐藏时立即把待发日志交给 main，尽量不丢最后一批。
 */
export function installLocalLogGlobalHandlers() {
  if (globalHandlersInstalled || typeof window === 'undefined') return
  globalHandlersInstalled = true
  window.addEventListener('error', (event) => {
    writeLocalLog({
      lv: 'error',
      cat: 'window',
      msg: 'uncaught_error',
      data: {
        ...describeError(event.error ?? event.message),
        source: event.filename,
        line: event.lineno,
        column: event.colno,
      },
    })
  })
  window.addEventListener('unhandledrejection', (event) => {
    writeLocalLog({
      lv: 'error',
      cat: 'window',
      msg: 'unhandled_rejection',
      data: describeError(event.reason),
    })
  })
  window.addEventListener('pagehide', flushToMain)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushToMain()
  })
}
