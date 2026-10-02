import type { DiagnosticLogEntry } from './types'

export interface LogThrottleOptions {
  now?: () => number
  /** 重复合并窗口 */
  windowMs?: number
  /** 窗口内同类记录逐条写入的上限，超出部分只计数 */
  burst?: number
  /** info / debug 每分钟上限；warn / error 不限流（已有重复合并兜底） */
  infoPerMinute?: number
}

interface RepeatGroup {
  start: number
  count: number
  suppressed: number
  sample: DiagnosticLogEntry
}

const errorCodeOf = (data: unknown) =>
  data && typeof data === 'object' && 'error_code' in data
    ? String((data as { error_code: unknown }).error_code)
    : ''

/**
 * 日志防刷屏：重复合并 + info 限流。
 * 轮转只能限制总量，挡不住同一错误在短时间内把有用历史挤出去，所以在写入前先节流。
 * 纯逻辑、时钟可注入，便于单测。
 */
export function createLogThrottle(
  write: (entry: DiagnosticLogEntry) => void,
  options: LogThrottleOptions = {},
) {
  const now = options.now ?? Date.now
  const windowMs = options.windowMs ?? 10_000
  const burst = options.burst ?? 5
  const infoPerMinute = options.infoPerMinute ?? 120

  const groups = new Map<string, RepeatGroup>()
  let infoWindowStart = now()
  let infoCount = 0
  let infoDropped = 0

  const writeRepeatSummary = (group: RepeatGroup, at: number) => {
    if (group.suppressed === 0) return
    write({ ...group.sample, t: new Date(at).toISOString(), repeated: group.suppressed })
  }

  const writeInfoSummary = (at: number) => {
    if (infoDropped === 0) return
    write({
      t: new Date(at).toISOString(),
      lv: 'warn',
      src: 'main',
      cat: 'log',
      msg: 'info_rate_limited',
      data: { dropped: infoDropped },
    })
    infoDropped = 0
  }

  /** 结束已过期的合并窗口，补写重复计数 */
  const tick = () => {
    const at = now()
    for (const [key, group] of groups) {
      if (at - group.start < windowMs) continue
      writeRepeatSummary(group, at)
      groups.delete(key)
    }
    if (at - infoWindowStart >= 60_000) {
      writeInfoSummary(at)
      infoWindowStart = at
      infoCount = 0
    }
  }

  const push = (entry: DiagnosticLogEntry) => {
    tick()
    if (entry.lv === 'info' || entry.lv === 'debug') {
      infoCount += 1
      if (infoCount > infoPerMinute) {
        infoDropped += 1
        return
      }
    }
    const key = `${entry.lv}|${entry.src}|${entry.cat}|${entry.msg}|${errorCodeOf(entry.data)}`
    let group = groups.get(key)
    if (!group) {
      group = { start: now(), count: 0, suppressed: 0, sample: entry }
      groups.set(key, group)
    }
    group.count += 1
    if (group.count <= burst) write(entry)
    else group.suppressed += 1
  }

  /** 立即写出全部待补的汇总，用于退出、打包反馈与清空前 */
  const flush = () => {
    const at = now()
    for (const group of groups.values()) writeRepeatSummary(group, at)
    groups.clear()
    writeInfoSummary(at)
  }

  return { push, tick, flush }
}
