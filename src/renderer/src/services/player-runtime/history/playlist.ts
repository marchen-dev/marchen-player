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

/**
 * 只在首次进入 ended 时切集，避免重复通知造成多次加载。
 * 下一集在结束时才解析（可重新扫描目录）；解析返回时若已取消订阅、状态离开 ended
 * 或又发生了新一轮 ended，说明用户已接管播放，本轮放弃。
 */
export const subscribeAutomaticNext = (
  runtime: PlayerRuntime,
  playlist: PlaylistPort,
  resolveNext: () => Promise<PlaylistEntry | undefined>,
) => {
  let previousStatus = runtime.state.status
  let attempt = 0
  let disposed = false
  const unsubscribe = runtime.subscribe(() => {
    const status = runtime.state.status
    if (status === 'ended' && previousStatus !== 'ended') {
      const current = ++attempt
      void resolveNext()
        .then((next) => {
          if (!next || disposed || current !== attempt || runtime.state.status !== 'ended') return
          captureFeatureUsed('playlist', 'automatic_next')
          playlist.play(next)
        })
        .catch((error) => console.error('解析下一集失败', error))
    }
    previousStatus = status
  })
  return () => {
    disposed = true
    unsubscribe()
  }
}

export const samePlaylistSource = (entry: PlaylistEntry, source?: DurableMediaSource) => {
  if (!source || source.kind === 'remote-url') return false
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
