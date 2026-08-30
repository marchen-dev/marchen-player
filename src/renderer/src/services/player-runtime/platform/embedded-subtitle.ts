import type { SubtitleTrackDescriptor } from './ports'

/** 把 ffprobe 字幕流映射为 FFmpeg 0:s:N 使用的相对索引。 */
export const toEmbeddedSubtitleTrack = (
  stream: unknown,
  listIndex: number,
): SubtitleTrackDescriptor => {
  const tags = getTags(stream)
  return {
    id: `embedded:${listIndex}`,
    title: tags.title || `内嵌字幕 ${listIndex + 1}`,
    language: tags.language,
    origin: 'embedded',
  }
}

const getTags = (stream: unknown): { title?: string; language?: string } => {
  if (!stream || typeof stream !== 'object' || !('tags' in stream)) return {}
  const tags = stream.tags
  if (!tags || typeof tags !== 'object') return {}
  return {
    title: 'title' in tags && typeof tags.title === 'string' ? tags.title : undefined,
    language:
      'language' in tags && typeof tags.language === 'string' ? tags.language : undefined,
  }
}
