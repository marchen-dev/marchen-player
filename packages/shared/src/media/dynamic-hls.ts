import type { MediaCompatError } from './errors'
import type { PipelineFingerprint, PipelineRuntimeChoice } from './pipeline'

export const HLS_TIMELINE_SCHEMA_VERSION = 1 as const

export interface HlsSegmentDescriptor {
  index: number
  /** 归一到原视频逻辑时间的起点。 */
  startTime: number
  duration: number
  endTime: number
  keyframeAligned: boolean
  /** fragment 实际首 PTS；发布校准完成前为空，允许与计划 startTime 有小偏差。 */
  actualFirstPts?: number
  tail: boolean
}

export interface HlsTimeline {
  schemaVersion: typeof HLS_TIMELINE_SCHEMA_VERSION
  /** 原输入视频的实际 packet/stream 起点。 */
  sourceStartTime: number
  /** 选中视频轨道的真实跨度，不使用其他轨道延长的 format duration。 */
  duration: number
  targetSegmentDuration: number
  mode: 'keyframe-aligned-copy' | 'closed-gop-transcode'
  segments: HlsSegmentDescriptor[]
}

export type SegmentResourceStatus = 'missing' | 'producing' | 'published' | 'failed' | 'evicted'

export interface SegmentStoreEntrySnapshot extends HlsSegmentDescriptor {
  /** 实际媒体范围独立于清单计划，不回写计划 start/end。 */
  actualRange?: { video: { start: number; end: number }; audio?: { start: number; end: number } }
  status: SegmentResourceStatus
  waiterCount: number
  activeRequestCount: number
  sizeBytes?: number
  error?: MediaCompatError
}

export interface SegmentStoreSnapshot {
  sessionId: string
  initStatus: SegmentResourceStatus
  initWaiterCount: number
  initActiveRequestCount: number
  entries: SegmentStoreEntrySnapshot[]
  publishedBytes: number
  productionPosition?: number
  consumptionPosition?: number
  /** 最近一次分片下载的位置，不代表实际播放或安全回收位置。 */
  downloadPosition?: number
  continuousPublishedEnd?: number
  lastClientActivityAt?: number
}

export type PlaybackJobPhase =
  'idle' | 'starting' | 'producing' | 'throttled' | 'stopping' | 'stopped' | 'failed'

export interface PlaybackJobCoverage {
  startSegment: number
  endSegment?: number
}

/** 不含 Process、路径、token 或完整 stderr，可安全通过 IPC/诊断展示。 */
export interface PlaybackJobSnapshot {
  id: string
  sessionId: string
  phase: PlaybackJobPhase
  pipeline: PipelineFingerprint
  runtime: PipelineRuntimeChoice
  audioOutput?: { channels: number; sampleRate: number; bitRate: number }
  coverage: PlaybackJobCoverage
  requestedStartTime: number
  actualFirstPts?: number
  productionPosition?: number
  consumptionPosition?: number
  aheadDuration?: number
  processingSpeed?: number
  activeRequestCount: number
  waiterCount: number
  lastHeartbeatAt?: number
  lastProgressAt?: number
  startedAt?: number
  stoppedAt?: number
  exitCode?: number
  error?: MediaCompatError
}
