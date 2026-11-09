/**
 * 字幕失败的低基数原因，main 与 renderer 共用。
 * 遥测只按原因聚合，原始文案可能含本地路径或字幕正文，不进入上报。
 */
export type SubtitleFailureReason =
  | 'read_failed'
  | 'not_downloaded'
  | 'unsupported_format'
  | 'too_large'
  | 'vtt_header'
  | 'timestamp_invalid'
  | 'empty'
  /** 内嵌：MKV/EBML 结构损坏或无法定位 */
  | 'container_invalid'
  /** 内嵌：字幕块截断、缺少时间或时长、使用不支持的 lacing */
  | 'block_invalid'
  /** 内嵌：ASS 事件字段或时间无效 */
  | 'event_invalid'
  /** 字幕文本不是合法 UTF-8 */
  | 'text_encoding'
  /** 内嵌：压缩字幕块解压失败 */
  | 'decompress_failed'
  /** 内嵌：目标轨道不存在或已变化 */
  | 'track_missing'
  | 'unknown'

/** 带稳定原因的字幕错误；message 面向用户展示，reason 面向遥测聚合 */
export class SubtitleError extends Error {
  readonly reason: SubtitleFailureReason

  constructor(reason: SubtitleFailureReason, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'SubtitleError'
    this.reason = reason
  }
}

export const getSubtitleFailureReason = (error: unknown): SubtitleFailureReason =>
  error instanceof SubtitleError ? error.reason : 'unknown'
