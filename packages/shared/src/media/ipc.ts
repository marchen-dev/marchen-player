import type { FfmpegPlaybackCapabilities } from './capabilities'
import type { MediaCompatError } from './errors'
import type { PlaybackPlan } from './plan'
import type { MediaProbeResult } from './probe'
import type { MediaSessionSnapshot } from './session'
import type { ElectronDurableMediaSource, PlaybackSourceLeaseDescriptor } from './source'
import { toPublicMediaCompatError } from './errors'

export interface PrepareMediaSessionRequest {
  requestId: string
  source: ElectronDurableMediaSource
  plan: PlaybackPlan
  /** 新 planner shadow/迁移输入；旧 producer 仍以 plan 为执行依据。 */
  decision?: import('./decision').PlaybackDecision
  /** 同一决策退回 EVENT transport 的明确原因；不改变视频/音频动作。 */
  legacyTransportReason?: 'hls-timeline-unavailable' | 'keyframe-timeline-unavailable'
  startTime: number
  attemptChain?: import('./plan').OutputProfileKind[]
  attemptMethods?: import('./decision').PlaybackMethod[]
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
  requestId?: string
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
  decision: lease.decision ? copyDecision(lease.decision) : undefined,
  attemptMethods: lease.attemptMethods ? [...lease.attemptMethods] : undefined,
  transport: lease.transport,
  url: lease.url,
  mimeType: lease.mimeType,
  sessionId: lease.sessionId,
  generation: lease.generation,
  hlsSessionMode: lease.hlsSessionMode,
  timeline: { ...lease.timeline },
  hlsTimeline: lease.hlsTimeline ? copyHlsTimeline(lease.hlsTimeline) : undefined,
  job: lease.job ? copyJob(lease.job) : undefined,
  segmentStore: lease.segmentStore ? copySegmentStore(lease.segmentStore) : undefined,
})

const copyDecision = (
  decision: import('./decision').PlaybackDecision,
): import('./decision').PlaybackDecision => {
  const shared = {
    trial: decision.trial,
    subtitle: { ...decision.subtitle },
    reasons: decision.reasons.map((reason) => ({ ...reason })),
  }
  switch (decision.method) {
    case 'direct-play':
      return {
        ...shared,
        method: decision.method,
        container: { ...decision.container },
        video: { ...decision.video },
        audio: decision.audio ? { ...decision.audio } : undefined,
      }
    case 'direct-stream':
      return {
        ...shared,
        method: decision.method,
        container: { ...decision.container },
        video: { ...decision.video },
        audio: decision.audio ? { ...decision.audio } : undefined,
      }
    case 'transcode':
      return {
        ...shared,
        method: decision.method,
        container: { ...decision.container },
        video: { ...decision.video },
        audio: decision.audio ? { ...decision.audio } : undefined,
      }
  }
}

const copyHlsTimeline = (timeline: import('./dynamic-hls').HlsTimeline) => ({
  ...timeline,
  segments: timeline.segments.map((segment) => ({ ...segment })),
})

const copyJob = (job: import('./dynamic-hls').PlaybackJobSnapshot) => ({
  ...job,
  pipeline: { ...job.pipeline },
  runtime: {
    ...job.runtime,
    videoDecoder: job.runtime.videoDecoder ? { ...job.runtime.videoDecoder } : undefined,
    videoEncoder: { ...job.runtime.videoEncoder },
    audioEncoder: job.runtime.audioEncoder ? { ...job.runtime.audioEncoder } : undefined,
  },
  coverage: { ...job.coverage },
  error: job.error ? toPublicMediaCompatError(job.error) : undefined,
})

const copySegmentStore = (store: import('./dynamic-hls').SegmentStoreSnapshot) => ({
  ...store,
  entries: store.entries.map((entry) => ({
    ...entry,
    error: entry.error ? toPublicMediaCompatError(entry.error) : undefined,
  })),
})

/** IPC 输出显式拷贝白名单字段，Main 内部目录、进程和注册表对象不会被结构化克隆出去。 */
export const toMediaSessionIpcSnapshot = (session: MediaSessionSnapshot): MediaSessionSnapshot => ({
  id: session.id,
  logicalSourceId: session.logicalSourceId,
  mode: session.mode,
  profile: session.profile,
  attemptChain: session.attemptChain ? [...session.attemptChain] : undefined,
  decision: session.decision ? copyDecision(session.decision) : undefined,
  attemptMethods: session.attemptMethods ? [...session.attemptMethods] : undefined,
  status: session.status,
  phase: session.phase,
  activeGeneration: session.activeGeneration,
  lease: session.lease ? copyLease(session.lease) : undefined,
  job: session.job ? copyJob(session.job) : undefined,
  segmentStore: session.segmentStore ? copySegmentStore(session.segmentStore) : undefined,
  error: session.error ? toPublicMediaCompatError(session.error) : undefined,
})
