import type { SubtitleFailureReason } from '@marchen/shared/media'
import { getSubtitleFailureReason } from '@marchen/shared/media'
import { MediaSourceError } from '@marchen/shared/media-sources'
import { telemetry } from './client'

export type SubtitleFailureStage = 'resolve' | 'renderer' | 'catalog' | 'import'

const reported = new WeakSet<object>()

/** 媒体源字幕读取失败已有自己的错误码，这里只归为读取失败，避免原因维度膨胀 */
const resolveReason = (error: unknown): SubtitleFailureReason =>
  error instanceof MediaSourceError ? 'read_failed' : getSubtitleFailureReason(error)

/** 字幕降级不会成为全局异常，必须显式上报；记录阶段与低基数原因，不收集字幕内容、文件名或 URL。 */
export function reportSubtitleFailure(stage: SubtitleFailureStage, error: unknown) {
  if (error instanceof Error && error.name === 'AbortError') return
  if (error && typeof error === 'object') {
    if (reported.has(error)) return
    reported.add(error)
  }
  const errorCode = `SUBTITLE_${stage.toUpperCase()}_FAILED`
  const reason = resolveReason(error)
  // 原始错误可能包含本地路径、blob URL 或字幕正文；使用稳定诊断错误和低基数上下文。
  const diagnostic = new Error(`字幕${stage}阶段失败`)
  telemetry.captureException(diagnostic, {
    handled: true,
    mechanism: `subtitle.${stage}`,
    errorCode,
    fingerprint: ['subtitle', stage],
    tags: { subtitle_reason: reason },
    contexts: {
      subtitle: { stage, reason, error_type: error instanceof Error ? error.name : typeof error },
    },
  })
  telemetry.capture('subtitle_failed', { stage, error_code: errorCode, reason })
}
