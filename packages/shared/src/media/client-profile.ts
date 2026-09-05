import type { CapabilityEvidence, CapabilityVerdict, DecodeCapabilityFact } from './capabilities'
import type { MediaDynamicRange } from './probe'

export const CLIENT_PLAYBACK_PROFILE_SCHEMA_VERSION = 1 as const

export interface ContainerCapabilityProfile extends CapabilityEvidence {
  containerNames: string[]
  mimeType?: string
  contentType?: string
}

export interface VideoCapabilityConditions {
  codecName: string
  codecString?: string
  profile?: string
  level?: number
  bitDepth?: number
  dynamicRange: MediaDynamicRange
  width: number
  height: number
  frameRate?: number
}

export interface VideoCapabilityProfile {
  conditions: VideoCapabilityConditions
  decode: DecodeCapabilityFact
}

export interface VideoAudioCapabilityConditions {
  codecName: string
  codecString?: string
  profile?: string
  channels?: number
  sampleRate?: number
  bitDepth?: number
}

export interface VideoAudioCapabilityProfile {
  conditions: VideoAudioCapabilityConditions
  decode: DecodeCapabilityFact
}

export type SubtitleDeliveryMethod = 'external-render' | 'text-track' | 'embedded' | 'drop'

export interface SubtitleCapabilityProfile extends CapabilityEvidence {
  codecName: string
  delivery: SubtitleDeliveryMethod
}

interface PlaybackTransportProfileBase {
  container: ContainerCapabilityProfile
  video?: VideoCapabilityProfile
  audio?: VideoAudioCapabilityProfile
  subtitles: SubtitleCapabilityProfile[]
}

/** 原文件 URL 直接交给 HTMLVideoElement 时的完整容器与轨道能力。 */
export interface DirectPlaybackProfile extends PlaybackTransportProfileBase {
  kind: 'direct'
}

/** 本地兼容输出交给 HLS.js/MSE 时的目标 fMP4 能力。 */
export interface Fmp4HlsPlaybackProfile extends PlaybackTransportProfileBase {
  kind: 'fmp4-hls'
  container: ContainerCapabilityProfile & { mimeType: 'video/mp4' }
  mediaSourceSupported: CapabilityVerdict
}

interface ClientPlaybackProfileBase {
  schemaVersion: typeof CLIENT_PLAYBACK_PROFILE_SCHEMA_VERSION
  /** Electron/Chromium 版本、平台和本次进程能力组合的非敏感缓存 key。 */
  runtimeKey: string
  direct: DirectPlaybackProfile
  fmp4Hls: Fmp4HlsPlaybackProfile
}

export interface ElectronClientPlaybackProfile extends ClientPlaybackProfileBase {
  environment: 'electron'
  localCompatibilityAvailable: boolean
}

export interface WebClientPlaybackProfile extends ClientPlaybackProfileBase {
  environment: 'web'
  localCompatibilityAvailable: false
}

/** environment 判别同时约束 Web 永远不能声明本地兼容后端。 */
export type ClientPlaybackProfile = ElectronClientPlaybackProfile | WebClientPlaybackProfile
