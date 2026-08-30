/**
 * Marchen 播放会话核心。
 *
 * 该包不依赖 DOM、React、Electron、Dexie 或字幕/弹幕实现。
 */

export { isAutoplayBlocked, normalizePlayError } from './errors'
export { PlaybackSession } from './session'
export type {
  MediaEvent,
  MediaPort,
  PlaybackClock,
  PlaybackError,
  PlaybackErrorCode,
  PlaybackMediaRestoreState,
  PlaybackMediaSnapshot,
  PlaybackSource,
  PlaybackState,
} from './types'
