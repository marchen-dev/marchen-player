import { telemetry } from './client'

export type SubtitleFailureStage = 'resolve' | 'renderer' | 'catalog' | 'import'

const reported = new WeakSet<object>()

/** 字幕降级不会成为全局异常，必须显式上报；仅记录阶段，不收集字幕内容、文件名或 URL。 */
export function reportSubtitleFailure(stage: SubtitleFailureStage, error: unknown) {
  if (error instanceof Error && error.name === 'AbortError') return
  if (error && typeof error === 'object') {
    if (reported.has(error)) return
    reported.add(error)
  }
  const errorCode = `SUBTITLE_${stage.toUpperCase()}_FAILED`
  // 原始错误可能包含本地路径、blob URL 或字幕正文；使用稳定诊断错误和低基数上下文。
  const diagnostic = new Error(`字幕${stage}阶段失败`)
  telemetry.captureException(diagnostic, {
    handled: true,
    mechanism: `subtitle.${stage}`,
    errorCode,
    fingerprint: ['subtitle', stage],
    contexts: { subtitle: { stage, error_type: error instanceof Error ? error.name : typeof error } },
  })
  telemetry.capture('subtitle_failed', { stage, error_code: errorCode })
}
