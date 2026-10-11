import type { DurableMediaSource } from '@marchen/shared/media'
import type { PlayerPorts, PlaylistEntry } from '../platform'
import type { PlayerRuntime } from '../runtime'
import { usePlayerSettingsValue } from '@renderer/atoms/settings/player'
import { db } from '@renderer/database/db'
import { markEpisodeStarted, markEpisodeWatched } from '@renderer/database/lib/library-writer'
import { ipcClient } from '@renderer/lib/client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { registerUpdatePreparation } from '../update-preparation'
import { PlaybackHistoryAdapter } from './playback-history-adapter'
import { PlaybackSnapshotAdapter } from './playback-snapshot-adapter'
import { resolvePlaylistNeighbors, subscribeAutomaticNext } from './playlist'

export interface PlaybackSessionObserversOptions {
  runtime: PlayerRuntime | null
  ports: PlayerPorts
  hash?: string
  source?: DurableMediaSource
}

/** 组合历史、截图和双端连播观察者，UI 只拿到可执行的上一集/下一集。 */
export const usePlaybackSessionObservers = ({
  runtime,
  ports,
  hash,
  source,
}: PlaybackSessionObserversOptions) => {
  const { enableAutomaticEpisodeSwitching } = usePlayerSettingsValue()
  const [playlist, setPlaylist] = useState<ReadonlyArray<PlaylistEntry>>([])
  const playlistRef = useRef(playlist)
  playlistRef.current = playlist
  // 当前生效的 source；列表读取返回时 source 已切换则丢弃结果，避免旧目录覆盖新列表
  const activeSourceRef = useRef<DurableMediaSource | undefined>(undefined)

  /** 重新读取列表；结果过期或读取失败时返回 undefined，调用方自行决定回退。 */
  const refreshPlaylist = useCallback(async () => {
    const port = ports.playlist
    if (!port || !source) return undefined
    try {
      const items = await port.list(source)
      if (activeSourceRef.current !== source) return undefined
      setPlaylist(items)
      return items
    } catch (error) {
      console.error('读取播放列表失败', error)
      return undefined
    }
  }, [ports, source])

  useEffect(() => {
    if (!ports.playlist || !source) {
      setPlaylist([])
      return
    }
    activeSourceRef.current = source
    void refreshPlaylist()
    return () => {
      activeSourceRef.current = undefined
    }
  }, [ports, refreshPlaylist, source])

  const { previous, next } = useMemo(
    () => resolvePlaylistNeighbors(playlist, source),
    [playlist, source],
  )

  useEffect(() => {
    if (!runtime || !hash || !source) return
    const history = new PlaybackHistoryAdapter({
      runtime,
      hash,
      repository: db.history,
      // 内核协调器已在初始 source 中恢复进度，观察者不能再发一次异步 seek 覆盖用户操作。
      restoreProgress: false,
      markStarted: markEpisodeStarted,
      markWatched: markEpisodeWatched,
      onError: (error) => console.error('同步播放历史失败', error),
    })
    const snapshot = ports.snapshot
      ? new PlaybackSnapshotAdapter({
          runtime,
          hash,
          source,
          snapshot: ports.snapshot,
          repository: db.history,
          onError: (error) => console.error('生成播放缩略图失败', error),
        })
      : null
    const unregisterUpdate = registerUpdatePreparation(async () => {
      runtime.commands.pause()
      await history.flush()
    })
    let lastPlaying: boolean | undefined
    const notifyPlaying = () => {
      const playing = runtime.state.status === 'playing'
      if (playing === lastPlaying) return
      lastPlaying = playing
      void ipcClient?.app.updatePlaybackState({ playing }).catch(console.error)
    }
    const unsubscribePlaying = runtime.subscribe(notifyPlaying)
    notifyPlaying()
    history.start()
    snapshot?.start()
    return () => {
      unregisterUpdate()
      unsubscribePlaying()
      void ipcClient?.app.updatePlaybackState({ playing: false }).catch(console.error)
      snapshot?.dispose()
      history.dispose()
    }
  }, [hash, ports, runtime, source])

  // 不依赖已知的下一集：追更时最新一集播完，结束时重新扫描才能续上刚下载好的新集
  useEffect(() => {
    if (!runtime || !ports.playlist || !source || !enableAutomaticEpisodeSwitching) return
    return subscribeAutomaticNext(runtime, ports.playlist, async () => {
      const items = (await refreshPlaylist()) ?? playlistRef.current
      return resolvePlaylistNeighbors(items, source).next
    })
  }, [enableAutomaticEpisodeSwitching, ports, refreshPlaylist, runtime, source])

  return {
    playlist,
    refreshPlaylist,
    onSelectPlaylist: ports.playlist?.play,
    onPrevious: previous && ports.playlist ? () => ports.playlist?.play(previous) : undefined,
    onNext: next && ports.playlist ? () => ports.playlist?.play(next) : undefined,
  }
}
