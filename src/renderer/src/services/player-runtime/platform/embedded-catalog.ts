import type { DurableMediaSource } from '@marchen/shared/media'
import type { SubtitleTrackDescriptor } from './ports'
import { MatroskaSubtitles } from '../../media/subtitles/matroska'
import { resolveEmbeddedSubtitle } from '../../media/subtitles/resolve'
import { openPlaybackResource } from './media-resource'

/** 两端使用相同的容器轨道编号；每次借用独立读取租约，不释放播放中的来源。 */
export async function listEmbeddedSubtitles(
  source: DurableMediaSource,
  signal = new AbortController().signal,
): Promise<SubtitleTrackDescriptor[]> {
  if (!source.name.toLowerCase().endsWith('.mkv')) return []
  const resource = await openPlaybackResource(source, signal)
  const lease = resource.acquire()
  try {
    const reader = await MatroskaSubtitles.open(lease.source, signal)
    return reader.tracks.map((track) => ({
      id: `embedded:${track.number}`,
      title: (track.title || `内嵌字幕 ${track.number}`) + (track.supported ? '' : '（暂不支持）'),
      language: track.language,
      origin: 'embedded',
      embedded: { number: track.number, uid: track.uid, codec: track.codec },
      supported: track.supported,
    }))
  } finally {
    lease.release()
    resource.close()
  }
}

export async function resolveEmbeddedTrack(
  source: DurableMediaSource,
  track: SubtitleTrackDescriptor,
  signal = new AbortController().signal,
) {
  const resource = await openPlaybackResource(source, signal)
  const lease = resource.acquire()
  try {
    const number = track.embedded?.number ?? Number(track.id.replace('embedded:', ''))
    const resolved = await resolveEmbeddedSubtitle(lease.source, number, signal, track.embedded)
    return { ...track, ...resolved }
  } finally {
    lease.release()
    resource.close()
  }
}
