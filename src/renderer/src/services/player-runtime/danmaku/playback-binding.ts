import type { PlaybackClock, PlaybackState } from '@marchen/playback-core'
import type { DomDanmakuRenderer } from './dom-danmaku-renderer'

type DanmakuPlaybackTarget = Pick<
  DomDanmakuRenderer,
  'play' | 'pause' | 'setRate' | 'seek' | 'restoreAfterSeek' | 'reset'
>

/** 同步订阅每次会话状态变化，避免 React 合并渲染时漏掉瞬时 seeking。 */
export const bindDanmakuPlayback = (
  runtime: {
    readonly state: PlaybackState
    readonly clock?: PlaybackClock
    subscribe: (listener: () => void) => () => void
  },
  renderer: DanmakuPlaybackTarget,
): (() => void) => {
  let seeking = false
  const initial = runtime.state
  let sourceId = 'source' in initial ? initial.source?.id : undefined
  const update = () => {
    const state = runtime.state
    const nextSourceId = 'source' in state ? state.source?.id : undefined
    const sourceChanged = sourceId !== nextSourceId
    sourceId = nextSourceId
    if (sourceChanged) {
      seeking = false
      renderer.reset()
    }
    // 兼容内核换 transport 的 load-start 不应取消同一媒体正在进行的 seek。
    if (seeking && state.status === 'loading' && !sourceChanged) {
      renderer.pause()
      return
    }
    if (
      state.status === 'idle' ||
      state.status === 'loading' ||
      state.status === 'error' ||
      state.status === 'ended'
    ) {
      seeking = false
      if (!sourceChanged) renderer.reset()
      return
    }
    renderer.setRate(state.rate)
    if (state.status === 'seeking') {
      seeking = true
      renderer.pause()
      renderer.seek(state.targetTime)
      return
    }
    if (seeking && runtime.clock?.snapshot().seeking) {
      renderer.pause()
      return
    }
    if (state.status === 'playing') renderer.play()
    else renderer.pause()
    if (seeking) {
      seeking = false
      renderer.restoreAfterSeek(state.currentTime)
    }
  }
  const unsubscribe = runtime.subscribe(update)
  // 支持未立即回放当前值的订阅实现；重复状态更新由 renderer 幂等处理。
  update()
  return unsubscribe
}
