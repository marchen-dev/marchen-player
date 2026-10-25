import type { SubtitleTrackDescriptor } from '../platform/ports'
import type { SubtitleTrackOption } from './context'

export const allocateExternalHistoryId = (
  tags: ReadonlyArray<{ id: number }>,
  used: ReadonlySet<number>,
) => {
  let id = Math.min(-1, ...tags.map((tag) => tag.id)) - 1
  while (used.has(id)) id -= 1
  return id
}

/**
 * 目录轨道在 HISTORY 中的 id：
 * - 内嵌轨道用轨道号；
 * - 带稳定标识的外挂轨道（媒体源字幕）沿用历史中 path 相同的 tag，续播时能恢复选择；
 * - 其余外挂轨道分配新的负数 id。
 */
export const resolveTrackHistoryId = (
  track: SubtitleTrackDescriptor,
  tags: ReadonlyArray<{ id: number; origin?: string; path?: string }>,
  used: ReadonlySet<number>,
) => {
  if (track.origin === 'embedded') {
    const embeddedId = track.embedded?.number ?? Number(track.id.replace('embedded:', ''))
    if (Number.isInteger(embeddedId)) return embeddedId
  }
  const persisted = track.persistenceKey
    ? tags.find((tag) => tag.origin === 'external' && tag.path === track.persistenceKey)
    : undefined
  if (persisted && !used.has(persisted.id)) return persisted.id
  return allocateExternalHistoryId(tags, used)
}

export const isChineseLanguage = (language?: string) =>
  Boolean(language && /^(?:zh|zho|chi|chs|cht)(?:-|$)/i.test(language))

export const selectPreferredSubtitleTrack = (
  tracks: ReadonlyArray<SubtitleTrackOption>,
  defaultId?: number,
) =>
  tracks.find((track) => track.historyId === defaultId) ??
  tracks.find((track) => isChineseLanguage(track.language)) ??
  tracks[0]
