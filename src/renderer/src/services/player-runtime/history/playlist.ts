import type { PlaylistEntry, PlaylistPort } from '../platform'
import type { PlayerRuntime } from '../runtime'

export interface PlaylistNeighbors {
  currentIndex: number
  previous?: PlaylistEntry
  next?: PlaylistEntry
}

export const resolvePlaylistNeighbors = (
  playlist: ReadonlyArray<PlaylistEntry>,
  sourceUrl?: string,
): PlaylistNeighbors => {
  const currentIndex = playlist.findIndex((entry) => sameSource(entry.sourceUrl, sourceUrl))
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
    if (status === 'ended' && previousStatus !== 'ended') playlist.play(next)
    previousStatus = status
  })
}

const sameSource = (left: string, right?: string) => {
  if (!right) return false
  return normalizeSource(left) === normalizeSource(right)
}

const normalizeSource = (value: string) => decodeURI(value).replace(/^marchen:\/\//, '')
