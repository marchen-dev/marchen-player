import type { PlaybackFallbackState } from './fallback-controller'
import type { PlayerRuntime } from './runtime'

export type PlaybackVisualState = Omit<PlaybackFallbackState, 'media'>

export interface PlaybackVisualStateRestorePort {
  setRotation: (rotation: PlaybackFallbackState['rotation']) => void
  selectSubtitle: (selectedId: string) => Promise<void> | void
  setSubtitleTimeOffset: (offset: number) => Promise<void> | void
  setDanmakuEnabled: (enabled: boolean) => Promise<void> | void
}

export const capturePlaybackFallbackState = (
  runtime: PlayerRuntime,
  visual: PlaybackVisualState,
): PlaybackFallbackState => {
  const snapshot = runtime.clock.snapshot()
  return {
    media: {
      currentTime: snapshot.currentTime,
      volume: snapshot.volume,
      muted: snapshot.muted,
      rate: snapshot.rate,
      paused: snapshot.paused,
    },
    rotation: visual.rotation,
    subtitle: { ...visual.subtitle },
    danmaku: { ...visual.danmaku },
  }
}

/** fallback 与 seek generation 共用同一恢复入口，避免只恢复 currentTime。 */
export const restorePlaybackFallbackState = async (
  runtime: PlayerRuntime,
  state: PlaybackFallbackState,
  visual: PlaybackVisualStateRestorePort,
): Promise<void> => {
  runtime.commands.restore(state.media)
  visual.setRotation(state.rotation)
  await visual.selectSubtitle(state.subtitle.selectedId)
  await visual.setSubtitleTimeOffset(state.subtitle.timeOffset)
  await visual.setDanmakuEnabled(state.danmaku.enabled)
}
