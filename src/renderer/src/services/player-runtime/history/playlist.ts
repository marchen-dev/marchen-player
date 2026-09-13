import type { DurableMediaSource } from '@marchen/shared/media'
import type { PlaylistEntry, PlaylistPort } from '../platform'
import type { PlayerRuntime } from '../runtime'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'

export interface PlaylistNeighbors {
  currentIndex: number
  previous?: PlaylistEntry
  next?: PlaylistEntry
}

export const resolvePlaylistNeighbors = (
  playlist: ReadonlyArray<PlaylistEntry>,
  source?: DurableMediaSource,
): PlaylistNeighbors => {
  const currentIndex = playlist.findIndex((entry) => samePlaylistSource(entry, source))
  return {
    currentIndex,
    previous: currentIndex > 0 ? playlist[currentIndex - 1] : undefined,
    next: currentIndex >= 0 ? playlist[currentIndex + 1] : undefined,
  }
}

/** 只在首次进入 ended 时切集，避免重复通知造成多次加载。 */
export const subscribeAutomaticNext = (
  runtime: PlayerRuntime,
  playlist: PlaylistPort,
  next: PlaylistEntry,
) => {
  let previousStatus = runtime.state.status
  return runtime.subscribe(() => {
    const status = runtime.state.status
    if (status === 'ended' && previousStatus !== 'ended') {
      captureFeatureUsed('playlist', 'automatic_next')
      playlist.play(next)
    }
    previousStatus = status
  })
}

export const samePlaylistSource = (entry: PlaylistEntry, source?: DurableMediaSource) => {
  if (!source) return false
  if (source.kind === 'web-file') return entry.file === source.file
  if (!entry.path) return false
  if (entry.fileHash && entry.fileHash === source.hash) return true
  return normalizePath(entry.path) === normalizePath(source.path)
}

const normalizePath = (value: string) => {
  const normalized = value.replaceAll('\\', '/').replace(/\/+$/, '')
  return /^[a-z]:\//i.test(normalized) || normalized.startsWith('//')
    ? normalized.toLowerCase()
    : normalized
}
