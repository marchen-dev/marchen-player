import type {
  MediaCompatErrorCode,
  MediaGenerationSnapshot,
  MediaProbeResult,
  OutputProfileKind,
  PlaybackMode,
  PlaybackPlan,
  PlaybackPlanReason,
  PlaybackSourceLeaseDescriptor,
} from '@marchen/shared/media'
import { MEDIA_COMPAT_ERROR_CODES } from '@marchen/shared/media'

/**
 * 产品分析只接受这些稳定枚举。这里是 FFmpeg 兼容层与遥测层的显式防腐边界，
 * 不直接展开计划、租约或 ffprobe 的原始对象，避免路径、URL 和内部字段被误上报。
 */
export const TELEMETRY_PLAYBACK_MODES = [
  'direct',
  'remux',
  'transcode-audio',
  'transcode-video',
] as const satisfies readonly PlaybackMode[]

export const TELEMETRY_PLAYBACK_PLAN_REASONS = [
  'native-compatible',
  'container-incompatible',
  'audio-incompatible',
  'video-incompatible',
  'native-decode-failed',
] as const satisfies readonly PlaybackPlanReason[]

export const TELEMETRY_MEDIA_ERROR_CODES =
  MEDIA_COMPAT_ERROR_CODES satisfies readonly MediaCompatErrorCode[]

export interface PlayerMediaTelemetryFields {
  mode: PlaybackMode
  profile: OutputProfileKind
  reason: PlaybackPlanReason
  container?: string
  video_codec?: string
  audio_codec?: string
}

export interface PlayerLeaseTelemetryFields {
  mode: PlaybackMode
  transport: PlaybackSourceLeaseDescriptor['transport']
  generation?: number
  timeline_offset: number
  timeline_calibrated: boolean
}

export interface PlayerGenerationTelemetryFields {
  generation: number
  status: MediaGenerationSnapshot['status']
  requested_start_time: number
  actual_first_timestamp?: number
  produced_duration?: number
  bytes_written?: number
}

const codecFor = (probe: MediaProbeResult, streamIndex: number | undefined) =>
  streamIndex === undefined
    ? undefined
    : probe.streams.find((stream) => stream.index === streamIndex)?.codecName.toLowerCase()

export const modeForOutputProfile = (profile: OutputProfileKind): PlaybackMode => {
  switch (profile) {
    case 'native':
      return 'direct'
    case 'copy-video-aac':
      return 'transcode-audio'
    case 'safe-h264-aac-sdr':
    case 'hdr-to-sdr-h264-aac':
      return 'transcode-video'
  }
}

export const mapPlaybackPlanToTelemetry = (
  plan: PlaybackPlan,
  probe?: MediaProbeResult,
): PlayerMediaTelemetryFields => ({
  mode: modeForOutputProfile(plan.kind),
  profile: plan.kind,
  reason: plan.reason,
  container: probe?.formatNames[0]?.toLowerCase(),
  video_codec: codecFor(probe as MediaProbeResult, probe?.primaryVideoStreamIndex),
  audio_codec: codecFor(probe as MediaProbeResult, probe?.primaryAudioStreamIndex),
})

export const mapPlaybackLeaseToTelemetry = (
  lease: PlaybackSourceLeaseDescriptor,
): PlayerLeaseTelemetryFields => ({
  mode: lease.mode,
  transport: lease.transport,
  generation: lease.generation,
  timeline_offset: lease.timeline.offset,
  timeline_calibrated: lease.timeline.calibrated,
})

export const mapGenerationToTelemetry = (
  snapshot: MediaGenerationSnapshot,
): PlayerGenerationTelemetryFields => ({
  generation: snapshot.generation,
  status: snapshot.status,
  requested_start_time: snapshot.requestedStartTime,
  actual_first_timestamp: snapshot.actualFirstTimestamp,
  produced_duration: snapshot.producedDuration,
  bytes_written: snapshot.bytesWritten,
})
