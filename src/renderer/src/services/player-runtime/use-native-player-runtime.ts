import type { PlaybackSource } from '@marchen/playback-core'
import type { ReadyState, ReloadingState } from '@marchen/player-loading'
import { MARCHEN_PROTOCOL_PREFIX } from '@marchen/shared/constants/protocol'
import { isWeb } from '@renderer/lib/utils'
import { usePlayerLoadingState } from '@renderer/services/player-loading/hooks'
import { useEffect, useRef, useState } from 'react'
import { HtmlVideoMediaAdapter } from './adapters'
import { PlayerRuntime } from './runtime'

type PreparedLoadingState = ReadyState | ReloadingState

export const createPlaybackSource = (
  state: PreparedLoadingState,
  leasedUrl?: string,
): PlaybackSource => {
  const { video } = state
  const sourceUrl = leasedUrl ?? video.url
  const url =
    isWeb || sourceUrl.startsWith(MARCHEN_PROTOCOL_PREFIX)
      ? sourceUrl
      : `${MARCHEN_PROTOCOL_PREFIX}${sourceUrl}`

  return {
    id: `${video.hash}:${video.url}`,
    url,
    title: video.name,
    autoplay: true,
  }
}

/**
 * 只在 player-loading 已准备好数据时拥有 Runtime。
 * ready 与 reloading 之间保持实例；新导入、cancel 或卸载会销毁旧实例。
 */
export const useNativePlayerRuntime = (video: HTMLVideoElement | null): PlayerRuntime | null => {
  const loadingState = usePlayerLoadingState()
  const active = loadingState.step === 'ready' || loadingState.step === 'reloading'
  const [runtime, setRuntime] = useState<PlayerRuntime | null>(null)
  const loadedSource = useRef<{ runtime: PlayerRuntime; id: string } | null>(null)

  useEffect(() => {
    if (!video || !active) {
      setRuntime(null)
      return
    }

    const nextRuntime = new PlayerRuntime(new HtmlVideoMediaAdapter(video))
    setRuntime(nextRuntime)

    return () => {
      nextRuntime.destroy()
      loadedSource.current = null
      setRuntime((current) => (current === nextRuntime ? null : current))
    }
  }, [active, video])

  useEffect(() => {
    if (!runtime || !active) return
    const logicalId = `${loadingState.video.hash}:${loadingState.video.url}`
    if (loadedSource.current?.runtime === runtime && loadedSource.current.id === logicalId) return

    const lease = loadingState.video.acquireSource?.()
    const source = createPlaybackSource(loadingState, lease?.url)
    runtime.load(source, lease?.release ?? loadingState.video.releaseSource)
    loadedSource.current = { runtime, id: logicalId }
    if (source.autoplay) void runtime.commands.play()
  }, [active, loadingState, runtime])

  return runtime
}
