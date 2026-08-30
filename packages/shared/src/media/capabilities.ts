export type CapabilityVerdict = true | false | 'unknown'

export interface DecodeCapabilityFact {
  codecString?: string
  supported: CapabilityVerdict
  smooth: CapabilityVerdict
  powerEfficient: CapabilityVerdict
  source: 'media-capabilities' | 'can-play-type' | 'runtime-error' | 'unknown'
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
}
