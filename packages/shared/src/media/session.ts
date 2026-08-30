import type { PlaybackMode, PlaybackSourceLeaseDescriptor } from './source'

/** 会话表示逻辑媒体生命周期；seek 不会创建新的会话。 */
export type MediaSessionStatus = 'preparing' | 'running' | 'ready' | 'failed' | 'released'

/** 新兼容链路的证据阶段；旧 MediaSessionStatus 在状态机迁移完成前继续兼容。 */
export type MediaSessionPhase =
  | 'planning'
  | 'encoder-check'
  | 'producing'
  | 'producer-ready'
  | 'attaching'
  | 'playable'
  | 'failed'
  | 'released'

/** generation 表示一次具体的 FFmpeg 生产过程。 */
export type MediaGenerationStatus = 'starting' | 'producing' | 'finished' | 'failed' | 'cancelled'

export interface MediaSessionSnapshot {
  id: string
  logicalSourceId: string
  mode: PlaybackMode
  profile?: import('./plan').OutputProfileKind
  attemptChain?: import('./plan').OutputProfileKind[]
  status: MediaSessionStatus
  phase?: MediaSessionPhase
  activeGeneration?: number
  lease?: PlaybackSourceLeaseDescriptor
  error?: import('./errors').MediaCompatError
}

export interface MediaGenerationSnapshot {
  sessionId: string
  generation: number
  status: MediaGenerationStatus
  originalStartTime: number
  requestedStartTime: number
  actualFirstTimestamp?: number
  producedDuration?: number
  bytesWritten?: number
  segmentCount?: number
  encoderClass?: 'copy' | 'hardware' | 'software'
}

export type MediaSessionEvent =
  | { type: 'session-changed'; session: MediaSessionSnapshot }
  | { type: 'generation-changed'; generation: MediaGenerationSnapshot }
