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
  const currentIndex = playlist.findIndex((entry) => sameSource(entry, source))
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

const sameSource = (entry: PlaylistEntry, source?: DurableMediaSource) => {
  if (!source || source.kind !== 'electron-file') return false
  if (entry.fileHash && entry.fileHash === source.hash) return true
  return normalizePath(entry.path) === normalizePath(source.path)
}

const normalizePath = (value: string) => {
  let decoded = value
  try {
    decoded = decodeURI(value)
  } catch {}
  const withoutProtocol = decoded.replace(/^marchen:\/\//, '')
  const normalized = withoutProtocol.replaceAll('\\', '/').replace(/\/+$/, '')
  return /^[a-z]:\//i.test(normalized) || normalized.startsWith('//')
    ? normalized.toLowerCase()
    : normalized
}
