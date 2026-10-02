export type DiagnosticLogLevel = 'debug' | 'info' | 'warn' | 'error'
export type DiagnosticLogSource = 'main' | 'renderer'

/**
 * 本地诊断日志的一条结构化记录，序列化为 JSON Lines 中的一行。
 * 字段名保持简短：日志总量有上限，越短能保留的历史越多。
 */
export interface DiagnosticLogEntry {
  /** 产生时刻（ISO）；renderer 记录自带时间，main 不覆盖，保证批量发送后顺序正确 */
  t: string
  lv: DiagnosticLogLevel
  src: DiagnosticLogSource
  /** 分类：app / player / window / process / updater / feedback 等 */
  cat: string
  msg: string
  /** 操作关联 ID（operation_id / attempt_id），用于串联一次导入或播放 */
  op?: string
  data?: unknown
  /** 重复合并：窗口内被省略的同类记录条数 */
  repeated?: number
  /** 单行超出上限被截断 */
  truncated?: boolean
}

export type DiagnosticLogInput = Omit<DiagnosticLogEntry, 't' | 'src'> &
  Partial<Pick<DiagnosticLogEntry, 't' | 'src'>>
