import type { SubtitleTrackOption } from './context'

export const allocateExternalHistoryId = (
  tags: ReadonlyArray<{ id: number }>,
  used: ReadonlySet<number>,
) => {
  let id = Math.min(-1, ...tags.map((tag) => tag.id)) - 1
  while (used.has(id)) id -= 1
  return id
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
