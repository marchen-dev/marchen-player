import type { PlaybackMode } from './source'

export type PlaybackPlanReason =
  | 'native-compatible'
  | 'container-incompatible'
  | 'audio-incompatible'
  | 'video-incompatible'
  | 'native-decode-failed'

export type OutputProfileKind =
  'native' | 'copy-video-aac' | 'safe-h264-aac-sdr' | 'hdr-to-sdr-h264-aac'

interface OutputProfileBase {
  kind: OutputProfileKind
  reason: PlaybackPlanReason
  videoStreamIndex: number
  audioStreamIndex?: number
}

export interface NativeOutputProfile extends OutputProfileBase {
  kind: 'native'
}

export interface CopyVideoAacOutputProfile extends OutputProfileBase {
  kind: 'copy-video-aac'
  video: 'copy'
  audio?: {
    codec: 'aac'
    profile: 'aac_low'
    sampleRate: 48_000
    channels: 1 | 2
  }
  startupDeadlineMs: number
}

export interface SafeH264AacSdrOutputProfile extends OutputProfileBase {
  kind: 'safe-h264-aac-sdr'
  video: { codec: 'h264'; pixelFormat: 'yuv420p'; toneMapToSdr: false }
  audio?: {
    codec: 'aac'
    profile: 'aac_low'
    sampleRate: 48_000
    channels: 1 | 2
  }
}

export interface HdrToSdrH264AacOutputProfile extends OutputProfileBase {
  kind: 'hdr-to-sdr-h264-aac'
  video: { codec: 'h264'; pixelFormat: 'yuv420p'; toneMapToSdr: true }
  audio?: {
    codec: 'aac'
    profile: 'aac_low'
    sampleRate: 48_000
    channels: 1 | 2
  }
}

export type OutputProfile =
  | NativeOutputProfile
  | CopyVideoAacOutputProfile
  | SafeH264AacSdrOutputProfile
  | HdrToSdrH264AacOutputProfile

export const playbackModeForOutputProfile = (profile: OutputProfileKind): PlaybackMode => {
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

interface PlaybackPlanBase {
  kind: PlaybackMode
  reason: PlaybackPlanReason
  videoStreamIndex: number
  audioStreamIndex?: number
}

export interface DirectPlaybackPlan extends PlaybackPlanBase {
  kind: 'direct'
}

export interface RemuxPlaybackPlan extends PlaybackPlanBase {
  kind: 'remux'
  video: 'copy'
  audio: 'copy'
}

export interface TranscodeAudioPlaybackPlan extends PlaybackPlanBase {
  kind: 'transcode-audio'
  video: 'copy'
  audio: {
    codec: 'aac'
    profile: 'aac_low'
    sampleRate: 48_000
    channels: 1 | 2
  }
}

export interface TranscodeVideoPlaybackPlan extends PlaybackPlanBase {
  kind: 'transcode-video'
  video: {
    codec: 'h264'
    toneMapToSdr: boolean
  }
  audio:
    | 'copy'
    | {
        codec: 'aac'
        profile: 'aac_low'
        sampleRate: 48_000
        channels: 1 | 2
      }
}

/** 对外 planner 与 IPC 只允许固定输出档位；旧计划类型仅供 Pipeline Compiler 迁移期内部使用。 */
export type PlaybackPlan = OutputProfile
