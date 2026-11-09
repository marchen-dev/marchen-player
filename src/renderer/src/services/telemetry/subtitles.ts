import type { SubtitleFailureReason } from '@marchen/shared/media'
import type { UnsupportedSubtitleCode } from '@renderer/services/media/subtitles/matroska'
import type { PgsSessionErrorCode, PgsSessionStats } from '@renderer/services/media/subtitles/pgs/protocol'
import { getSubtitleFailureReason } from '@marchen/shared/media'
import { MediaSourceError } from '@marchen/shared/media-sources'
import { PgsSessionError } from '@renderer/services/media/subtitles/pgs/client'
import { telemetry } from './client'

/** bitmap：位图字幕（PGS）会话在播放中失败 */
export type SubtitleFailureStage = 'resolve' | 'renderer' | 'catalog' | 'import' | 'bitmap'

/** 文本字幕沿用通用原因码；位图字幕会话带自己的稳定原因码 */
export type SubtitleFailureCode = SubtitleFailureReason | PgsSessionErrorCode

const reported = new WeakSet<object>()

/** 媒体源字幕读取失败已有自己的错误码，这里只归为读取失败，避免原因维度膨胀 */
const resolveReason = (error: unknown): SubtitleFailureCode =>
  error instanceof PgsSessionError
    ? error.code
    : error instanceof MediaSourceError
      ? 'read_failed'
      : getSubtitleFailureReason(error)

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
    // 同一阶段下不同原因是不同问题，分开成 issue，便于按原因跟进
    fingerprint: ['subtitle', stage, reason],
    tags: { subtitle_reason: reason },
    contexts: {
      subtitle: { stage, reason, error_type: error instanceof Error ? error.name : typeof error },
    },
  })
  telemetry.capture('subtitle_failed', { stage, error_code: errorCode, reason })
}

/** Matroska codec ID 枚举化；未收录的值归 other，避免属性基数失控 */
const CODECS = {
  'S_HDMV/PGS': 'pgs',
  'S_VOBSUB': 'vobsub',
  'S_DVBSUB': 'dvbsub',
  'S_HDMV/TEXTST': 'textst',
  'S_TEXT/WEBVTT': 'webvtt',
  'D_WEBVTT/SUBTITLES': 'webvtt',
  'D_WEBVTT/CAPTIONS': 'webvtt',
  'D_WEBVTT/DESCRIPTIONS': 'webvtt',
  'D_WEBVTT/METADATA': 'webvtt',
  'S_TEXT/USF': 'usf',
  'S_KATE': 'kate',
  'S_ARIBSUB': 'arib',
  'S_TEXT/ASS': 'ass',
  'S_ASS': 'ass',
  'S_TEXT/SSA': 'ssa',
  'S_SSA': 'ssa',
  'S_TEXT/UTF8': 'srt',
} as const

export type UnsupportedSubtitleCodec = (typeof CODECS)[keyof typeof CODECS] | 'other'

export const toUnsupportedSubtitleCodec = (codec: string): UnsupportedSubtitleCodec =>
  CODECS[codec.toUpperCase() as keyof typeof CODECS] ?? 'other'

const containerOf = (name: string) => {
  const extension = name.match(/\.([^.]+)$/)?.[1]?.toLowerCase()
  return extension === 'mkv' || extension === 'mk3d' || extension === 'webm' ? extension : 'other'
}

/** 会话内去重；同一媒体反复打开列表不重复计数，超过上限后整体清空以限制内存 */
const reportedTracks = new Set<string>()
const REPORTED_TRACK_LIMIT = 1000

/**
 * 统计内嵌轨的能力边界。不支持是预期内的边界而非故障，只发产品事件、不进 Sentry；
 * 事件只带枚举值，不带文件名或轨道标题。
 */
export function reportUnsupportedSubtitleTracks(
  media: { hash: string; name: string },
  tracks: readonly {
    number: number
    uid: string
    codec: string
    unsupportedCode?: UnsupportedSubtitleCode
  }[],
) {
  for (const track of tracks) {
    if (!track.unsupportedCode) continue
    const key = `${media.hash}:${track.number}:${track.uid}`
    if (reportedTracks.has(key)) continue
    if (reportedTracks.size >= REPORTED_TRACK_LIMIT) reportedTracks.clear()
    reportedTracks.add(key)
    telemetry.capture('subtitle_track_unsupported', {
      codec: toUnsupportedSubtitleCodec(track.codec),
      reason: track.unsupportedCode,
      container: containerOf(media.name),
    })
  }
}

/** 位图字幕会话结束时的汇总；只带枚举与数值，不带文件名、轨道标题或路径 */
export function reportBitmapSubtitleSession(report: {
  mode: 'index' | 'scan'
  hdr: boolean
  engine?: 'native' | 'compat'
  stats?: PgsSessionStats
}) {
  const { stats } = report
  telemetry.capture('subtitle_bitmap_session', {
    codec: 'pgs',
    mode: report.mode,
    hdr: report.hdr,
    engine: report.engine,
    first_bitmap_ms: stats?.firstBitmapMs,
    read_bytes: stats?.readBytes,
    max_backtrack: stats?.maxBacktrack,
    block_failures: stats?.blockFailures,
    decode_failures: stats?.decodeFailures,
    stats_missing: !stats,
  })
}
