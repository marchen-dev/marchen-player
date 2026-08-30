import type { FfmpegPlaybackCapabilities } from './capabilities'
import type { MediaCompatError } from './errors'
import type { PlaybackPlan } from './plan'
import type { MediaProbeResult } from './probe'
import type { MediaSessionSnapshot } from './session'
import type { ElectronDurableMediaSource, PlaybackSourceLeaseDescriptor } from './source'

export interface PrepareMediaSessionRequest {
  requestId: string
  source: ElectronDurableMediaSource
  plan: PlaybackPlan
  startTime: number
  attemptChain?: import('./plan').OutputProfileKind[]
}

export interface PrepareDirectMediaSessionRequest {
  requestId: string
  source: ElectronDurableMediaSource
}

export interface GetMediaSessionRequest {
  sessionId: string
}

export interface SeekMediaSessionRequest {
  sessionId: string
  expectedGeneration: number
  logicalTime: number
}

export interface ReleaseMediaSessionRequest {
  sessionId: string
}

interface AcknowledgeMediaSessionRequestBase {
  sessionId: string
  generation: number
}

export type AcknowledgeMediaSessionRequest = AcknowledgeMediaSessionRequestBase &
  ({ phase: 'attaching' | 'playable' } | { phase: 'failed'; error: MediaCompatError })

export interface ProbeMediaRequest {
  source: ElectronDurableMediaSource
}

export type ProbeMediaResult = MediaSessionIpcResult<MediaProbeResult>
export type FfmpegPlaybackCapabilitiesResult = MediaSessionIpcResult<FfmpegPlaybackCapabilities>

export type MediaSessionIpcRequest =
  | { type: 'prepare-direct'; payload: PrepareDirectMediaSessionRequest }
  | { type: 'prepare'; payload: PrepareMediaSessionRequest }
  | { type: 'get'; payload: GetMediaSessionRequest }
  | { type: 'seek'; payload: SeekMediaSessionRequest }
  | { type: 'acknowledge'; payload: AcknowledgeMediaSessionRequest }
  | { type: 'release'; payload: ReleaseMediaSessionRequest }

export type MediaSessionIpcResult<T> =
  { ok: true; data: T } | { ok: false; error: MediaCompatError }

const copyLease = (lease: PlaybackSourceLeaseDescriptor): PlaybackSourceLeaseDescriptor => ({
  id: lease.id,
  logicalSourceId: lease.logicalSourceId,
  mode: lease.mode,
  profile: lease.profile,
  attemptChain: lease.attemptChain ? [...lease.attemptChain] : undefined,
  transport: lease.transport,
  url: lease.url,
  mimeType: lease.mimeType,
  sessionId: lease.sessionId,
  generation: lease.generation,
  timeline: { ...lease.timeline },
})

/** IPC 输出显式拷贝白名单字段，Main 内部目录、进程和注册表对象不会被结构化克隆出去。 */
export const toMediaSessionIpcSnapshot = (session: MediaSessionSnapshot): MediaSessionSnapshot => ({
  id: session.id,
  logicalSourceId: session.logicalSourceId,
  mode: session.mode,
  profile: session.profile,
  attemptChain: session.attemptChain ? [...session.attemptChain] : undefined,
  status: session.status,
  phase: session.phase,
  activeGeneration: session.activeGeneration,
  lease: session.lease ? copyLease(session.lease) : undefined,
  error: session.error ? { ...session.error } : undefined,
})
