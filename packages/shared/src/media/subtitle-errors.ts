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
  | 'unknown'

/** 带稳定原因的字幕错误；message 面向用户展示，reason 面向遥测聚合 */
export class SubtitleError extends Error {
  readonly reason: SubtitleFailureReason

  constructor(reason: SubtitleFailureReason, message: string) {
    super(message)
    this.name = 'SubtitleError'
    this.reason = reason
  }
}

export const getSubtitleFailureReason = (error: unknown): SubtitleFailureReason =>
  error instanceof SubtitleError ? error.reason : 'unknown'
