import type { MediaAudioTrack } from '@marchen/playback-core'

/** 轨道编号只在媒体内有效；恢复时核对描述，找不到则选择明确的默认轨。 */
export function restoreAudioPreference(
  tracks: readonly MediaAudioTrack[],
  saved?: MediaAudioTrack,
  primaryId?: number,
) {
  if (saved) {
    const matches = tracks.filter(
      (track) =>
        track.language === saved.language &&
        track.codec === saved.codec &&
        track.label === saved.label &&
        track.channels === saved.channels,
    )
    const exact = matches.find((track) => track.id === saved.id)
    if (exact) return exact.id
    if (matches.length === 1) return matches[0].id
  }
  return (
    tracks.find((track) => track.id === primaryId)?.id ??
    tracks.find((track) => track.default)?.id ??
    tracks[0]?.id
  )
}
