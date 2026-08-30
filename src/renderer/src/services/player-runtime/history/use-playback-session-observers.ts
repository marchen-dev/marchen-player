import type { PlayerPorts, PlaylistEntry } from '../platform'
import type { PlayerRuntime } from '../runtime'
import { usePlayerSettingsValue } from '@renderer/atoms/settings/player'
import { db } from '@renderer/database/db'
import { markEpisodeWatched } from '@renderer/database/lib/library-writer'
import { useEffect, useMemo, useState } from 'react'
import { PlaybackHistoryAdapter } from './playback-history-adapter'
import { PlaybackSnapshotAdapter } from './playback-snapshot-adapter'
import { resolvePlaylistNeighbors, subscribeAutomaticNext } from './playlist'

export interface PlaybackSessionObserversOptions {
  runtime: PlayerRuntime | null
  ports: PlayerPorts
  hash?: string
  sourceUrl?: string
}

/** 组合历史、截图和 Electron 连播观察者，UI 只拿到可执行的上一集/下一集。 */
export const usePlaybackSessionObservers = ({
  runtime,
  ports,
  hash,
  sourceUrl,
}: PlaybackSessionObserversOptions) => {
  const { enableAutomaticEpisodeSwitching } = usePlayerSettingsValue()
  const [playlist, setPlaylist] = useState<ReadonlyArray<PlaylistEntry>>([])

  useEffect(() => {
    if (!ports.playlist || !sourceUrl) {
      setPlaylist([])
      return
    }
    let active = true
    void ports.playlist
      .list(sourceUrl)
      .then((items) => active && setPlaylist(items))
      .catch((error) => console.error('读取播放列表失败', error))
    return () => {
      active = false
    }
  }, [ports, sourceUrl])

  const { previous, next } = useMemo(
    () => resolvePlaylistNeighbors(playlist, sourceUrl),
    [playlist, sourceUrl],
  )

  useEffect(() => {
    if (!runtime || !hash || !sourceUrl) return
    const history = new PlaybackHistoryAdapter({
      runtime,
      hash,
      repository: db.history,
      markWatched: markEpisodeWatched,
      onError: (error) => console.error('同步播放历史失败', error),
    })
    const snapshot = ports.snapshot
      ? new PlaybackSnapshotAdapter({
          runtime,
          hash,
          sourceUrl,
          snapshot: ports.snapshot,
          repository: db.history,
          onError: (error) => console.error('生成播放缩略图失败', error),
        })
      : null
    history.start()
    snapshot?.start()
    return () => {
      snapshot?.dispose()
      history.dispose()
    }
  }, [hash, ports, runtime, sourceUrl])

  useEffect(() => {
    if (!runtime || !ports.playlist || !next || !enableAutomaticEpisodeSwitching) return
    return subscribeAutomaticNext(runtime, ports.playlist, next)
  }, [enableAutomaticEpisodeSwitching, next, ports, runtime])

  return {
    onPrevious: previous && ports.playlist ? () => ports.playlist?.play(previous) : undefined,
    onNext: next && ports.playlist ? () => ports.playlist?.play(next) : undefined,
  }
}
