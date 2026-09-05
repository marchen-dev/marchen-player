export type CapabilityVerdict = true | false | 'unknown'

export type CapabilityEvidenceSource =
  | 'media-capabilities'
  | 'can-play-type'
  | 'media-source'
  | 'runtime-error'
  | 'platform-rule'
  | 'unknown'

export interface CapabilityEvidence {
  supported: CapabilityVerdict
  smooth: CapabilityVerdict
  powerEfficient: CapabilityVerdict
  source: CapabilityEvidenceSource
}

export interface DecodeCapabilityFact extends CapabilityEvidence {
  codecString?: string
}

/** Renderer 在当前 Chromium/设备上探测到的事实，不代表 FFmpeg 能力。 */
export interface CapabilityFacts {
  containerSupported: CapabilityVerdict
  /** 固定兼容输出使用的 fMP4/MSE 容器能力。 */
  targetContainer: 'video/mp4'
  targetContainerSupported: CapabilityVerdict
  video?: DecodeCapabilityFact
  audio?: DecodeCapabilityFact
}

/** @deprecated 迁移期兼容名；新代码应使用 CapabilityFacts。 */
export type BrowserMediaCapabilities = CapabilityFacts

/** Main 自检后的桌面兼容播放能力；available 只有三段链路都就绪时才为 true。 */
export interface FfmpegPlaybackCapabilities {
  runtimeReady: boolean
  gatewayReady: boolean
  sessionApiReady: boolean
  available: boolean
  toneMapToSdr: boolean
  target?: string
  release?: string
  negotiation?: FfmpegNegotiationCapabilities
}

/** Main 从完整 runtime catalog 投影给纯 planner 的可序列化能力。 */
export interface FfmpegNegotiationCapabilities {
  available: boolean
  decodableCodecs: readonly string[]
  h264Output: boolean
  aacOutput: boolean
  fmp4HlsOutput: boolean
  toneMapToSdr: boolean
}
