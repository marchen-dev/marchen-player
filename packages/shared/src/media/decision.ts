import type { CompatibilityReason } from './compatibility-reason'
import type { AudioEncoderMode, VideoDecoderMode, VideoEncoderMode } from './pipeline'

export type PlaybackMethod = 'direct-play' | 'direct-stream' | 'transcode'

export interface DirectContainerAction {
  action: 'direct'
}

export interface RemuxContainerAction {
  action: 'remux'
  target: 'fmp4-hls'
}

interface StreamActionBase {
  streamIndex: number
  sourceCodec: string
}

export interface DirectVideoAction extends StreamActionBase {
  action: 'direct'
}

export interface CopyVideoAction extends StreamActionBase {
  action: 'copy'
}

export interface TranscodeVideoAction extends StreamActionBase {
  action: 'transcode'
  targetCodec: 'h264'
  pixelFormat: 'yuv420p'
  toneMap: 'none' | 'hdr-to-sdr'
  decoderMode?: VideoDecoderMode
  encoderMode?: VideoEncoderMode
}

export interface DirectAudioAction extends StreamActionBase {
  action: 'direct'
}

export interface CopyAudioAction extends StreamActionBase {
  action: 'copy'
}

export interface TranscodeAudioAction extends StreamActionBase {
  action: 'transcode'
  targetCodec: 'aac'
  profile: 'aac-low-complexity'
  sampleRate: 48_000
  channels: 1 | 2
  encoderMode?: AudioEncoderMode
}

export type SubtitleAction =
  { action: 'external-render'; streamIndex?: number } | { action: 'drop'; streamIndex?: number }

interface PlaybackDecisionBase {
  trial: boolean
  subtitle: SubtitleAction
  reasons: CompatibilityReason[]
}

export interface DirectPlayDecision extends PlaybackDecisionBase {
  method: 'direct-play'
  container: DirectContainerAction
  video: DirectVideoAction
  audio?: DirectAudioAction
}

export interface DirectStreamDecision extends PlaybackDecisionBase {
  method: 'direct-stream'
  container: RemuxContainerAction
  video: CopyVideoAction
  audio?: CopyAudioAction | TranscodeAudioAction
}

export interface TranscodeDecision extends PlaybackDecisionBase {
  method: 'transcode'
  container: RemuxContainerAction
  video: TranscodeVideoAction
  audio?: CopyAudioAction | TranscodeAudioAction
}

/** method 判别同时约束容器、视频和音频动作，不允许无效的组合型可选字段。 */
export type PlaybackDecision = DirectPlayDecision | DirectStreamDecision | TranscodeDecision
