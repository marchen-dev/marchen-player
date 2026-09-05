import type { PlaybackFallbackState } from './fallback-controller'
import type { PlayerRuntime } from './runtime'

export type PlaybackVisualState = Omit<PlaybackFallbackState, 'media'>

export interface PlaybackVisualStateRestorePort {
  setRotation: (rotation: PlaybackFallbackState['rotation']) => void
  selectSubtitle: (selectedId: string) => Promise<void> | void
  setSubtitleTimeOffset: (offset: number) => Promise<void> | void
  setDanmakuEnabled: (enabled: boolean) => Promise<void> | void
}

export interface PlaybackFallbackStatePort {
  capture: (runtime: PlayerRuntime) => PlaybackFallbackState
  restore: (runtime: PlayerRuntime, state: PlaybackFallbackState) => Promise<void>
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

/**
 * NativePlayer 不在 attempt 切换时重建，但仍用这个 bridge 明确快照/恢复各 Provider 状态，
 * 避免未来 transport 重构时偶然依赖 React 节点恰好没有卸载。
 */
export class PlaybackVisualStateBridge implements PlaybackFallbackStatePort {
  #visual: PlaybackVisualState = {
    rotation: 0,
    subtitle: { selectedId: 'off', timeOffset: 0 },
    danmaku: { enabled: true },
  }
  #restore: PlaybackVisualStateRestorePort = {
    setRotation: () => undefined,
    selectSubtitle: () => undefined,
    setSubtitleTimeOffset: () => undefined,
    setDanmakuEnabled: () => undefined,
  }

  bindRotation(
    rotation: PlaybackFallbackState['rotation'],
    setRotation: (value: PlaybackFallbackState['rotation']) => void,
  ): void {
    this.#visual.rotation = rotation
    this.#restore.setRotation = setRotation
  }

  bindSubtitle(input: {
    selectedId: string
    timeOffset: number
    selectSubtitle: (selectedId: string) => Promise<void> | void
    setSubtitleTimeOffset: (offset: number) => Promise<void> | void
  }): void {
    this.#visual.subtitle = { selectedId: input.selectedId, timeOffset: input.timeOffset }
    this.#restore.selectSubtitle = input.selectSubtitle
    this.#restore.setSubtitleTimeOffset = input.setSubtitleTimeOffset
  }

  bindDanmaku(enabled: boolean, setEnabled: (enabled: boolean) => Promise<void> | void): void {
    this.#visual.danmaku = { enabled }
    this.#restore.setDanmakuEnabled = setEnabled
  }

  capture(runtime: PlayerRuntime): PlaybackFallbackState {
    return capturePlaybackFallbackState(runtime, this.#visual)
  }

  restore(runtime: PlayerRuntime, state: PlaybackFallbackState): Promise<void> {
    return restorePlaybackFallbackState(runtime, state, this.#restore)
  }
}
