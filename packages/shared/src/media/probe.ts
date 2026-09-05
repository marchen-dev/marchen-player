export interface MediaDisposition {
  default: boolean
  forced: boolean
  attachedPicture: boolean
}

export interface MediaStreamTags {
  language?: string
  title?: string
}

export interface MediaStreamBase {
  index: number
  codecName: string
  /** 面向目标 MP4/MSE 的 RFC 6381 codec string；可由 ffprobe 或确定性规则得到。 */
  codecString?: string
  codecStringSource?: 'ffprobe' | 'derived' | 'unknown'
  codecLongName?: string
  codecTag?: string
  profile?: string
  startTime?: number
  duration?: number
  disposition: MediaDisposition
  tags: MediaStreamTags
}

export type MediaDynamicRange = 'sdr' | 'hdr10' | 'hlg' | 'dolby-vision' | 'unknown'

export interface MediaVideoStream extends MediaStreamBase {
  type: 'video'
  level?: number
  width: number
  height: number
  pixelFormat?: string
  bitDepth?: number
  frameRate?: number
  averageFrameRate?: number
  sampleAspectRatio?: string
  displayAspectRatio?: string
  rotation?: number
  colorRange?: string
  colorSpace?: string
  colorTransfer?: string
  colorPrimaries?: string
  dynamicRange: MediaDynamicRange
}

export interface MediaAudioStream extends MediaStreamBase {
  type: 'audio'
  bitDepth?: number
  sampleRate?: number
  channels?: number
  channelLayout?: string
  bitRate?: number
}

export interface MediaSubtitleStream extends MediaStreamBase {
  type: 'subtitle'
}

export interface MediaUnknownStream extends MediaStreamBase {
  type: 'unknown'
}

export type MediaStream =
  MediaVideoStream | MediaAudioStream | MediaSubtitleStream | MediaUnknownStream

export const INPUT_MEDIA_FACTS_SCHEMA_VERSION = 1 as const

/**
 * Main 基于规范路径与当前文件状态生成的不可逆源指纹。pathKey 只用于缓存失效，
 * 不暴露用户本地路径；size/mtime 变化会使 probe、关键帧和 preflight 缓存失效。
 */
export interface MediaSourceFingerprint {
  schemaVersion: typeof INPUT_MEDIA_FACTS_SCHEMA_VERSION
  sourceId: string
  pathKey: string
  size: number
  mtimeMs: number
}

/** Main 将 ffprobe 原始 JSON 规范化后的客观输入事实，不包含浏览器或 FFmpeg 能力推断。 */
export interface InputMediaFacts {
  schemaVersion: typeof INPUT_MEDIA_FACTS_SCHEMA_VERSION
  sourceFingerprint: MediaSourceFingerprint
  /** @deprecated 迁移期便捷字段；新缓存和会话身份使用 sourceFingerprint。 */
  sourceId: string
  formatNames: string[]
  formatLongName?: string
  startTime: number
  duration: number
  bitRate?: number
  streams: MediaStream[]
  primaryVideoStreamIndex?: number
  primaryAudioStreamIndex?: number
}

/** @deprecated 迁移期兼容名；新代码应使用 InputMediaFacts。 */
export type InputFacts = InputMediaFacts

/** @deprecated 迁移期兼容名；新代码应使用 InputFacts。 */
export type MediaProbeResult = InputMediaFacts
