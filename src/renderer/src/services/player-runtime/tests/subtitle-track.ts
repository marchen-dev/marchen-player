import type { ResolvedSubtitleTrack, ResolvedTextSubtitleTrack } from '../platform/ports'

/** 测试辅助：断言解析结果是文本字幕轨，并收窄类型以访问 url 等字段 */
export function asText(track: ResolvedSubtitleTrack | null | undefined): ResolvedTextSubtitleTrack {
  if (!track || track.kind !== 'text') throw new Error('预期为文本字幕轨')
  return track
}
