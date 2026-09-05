export const PIPELINE_FINGERPRINT_SCHEMA_VERSION = 1 as const
export const INIT_FINGERPRINT_SCHEMA_VERSION = 1 as const

export type VideoDecoderMode = 'auto' | 'hardware' | 'software'
export type VideoEncoderMode = 'auto' | 'hardware' | 'software'
export type AudioEncoderMode = 'auto' | 'system' | 'software'
export type MediaProcessorClass = 'copy' | 'hardware' | 'software' | 'system'

export interface MediaProcessorChoice {
  name: string
  class: MediaProcessorClass
}

export interface PipelineRuntimeChoice {
  videoDecoder?: MediaProcessorChoice
  videoEncoder: MediaProcessorChoice
  audioEncoder?: MediaProcessorChoice
}

/** 完整 pipeline 决策与 runtime choice 规范化后的不可逆身份。 */
export interface PipelineFingerprint {
  schemaVersion: typeof PIPELINE_FINGERPRINT_SCHEMA_VERSION
  algorithm: 'sha256'
  value: string
}

export interface InitTrackFingerprint {
  order: number
  trackId: string
  codec: string
  sampleEntry: string
  profile?: string
  level?: number
  timeBase: string
  extradataSize: number
  extradataHash: string
}

/** 只比较 SourceBuffer 解码相关字段，不使用完整 init 文件 hash。 */
export interface InitFingerprint {
  schemaVersion: typeof INIT_FINGERPRINT_SCHEMA_VERSION
  tracks: InitTrackFingerprint[]
}

export type ForcedPlaybackMethod = 'direct-stream' | 'transcode'

/** 仅开发构建可产生；生产与 Web 必须在进入 planner 前丢弃。 */
export interface DevelopmentPlaybackOverride {
  source: 'development-environment'
  method?: ForcedPlaybackMethod
  videoDecoderMode?: VideoDecoderMode
  videoEncoderMode?: VideoEncoderMode
  audioEncoderMode?: AudioEncoderMode
}
