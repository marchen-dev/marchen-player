/** 能跨播放会话保持稳定的媒体身份。 */
export interface DurableMediaIdentity {
  hash: string
  name: string
  size: number
}

/** Electron 持久化原始路径；播放 URL 由 source lifecycle 临时生成。 */
export interface ElectronDurableMediaSource extends DurableMediaIdentity {
  kind: 'electron-file'
  path: string
}

/** Web File 只在当前页面存活，不能写入 HISTORY 或通过 IPC 传递。 */
export interface WebDurableMediaSource extends DurableMediaIdentity {
  kind: 'web-file'
  file: File
}

export type DurableMediaSource = ElectronDurableMediaSource | WebDurableMediaSource
export type SerializableDurableMediaSource = ElectronDurableMediaSource

export type PlaybackMode = 'direct' | 'remux' | 'transcode-audio' | 'transcode-video'

export type PlaybackTransport =
  'custom-protocol' | 'http-range' | 'hls' | 'object-url' | 'external-url'

export interface PlaybackTimelineDescriptor {
  /** ffprobe 得到的原视频完整时长。 */
  originalDuration: number
  /** 当前 generation 的媒体元素时间零点对应的原视频逻辑时间。 */
  offset: number
  /** 实际首个输出 PTS 校准完成前为 false。 */
  calibrated: boolean
}

/** 可通过 IPC 返回的租约数据，不包含 Renderer 本地释放函数。 */
export interface PlaybackSourceLeaseDescriptor {
  id: string
  logicalSourceId: string
  mode: PlaybackMode
  /** 固定输出档位；mode 在迁移完成前只保留给旧 transport/telemetry 调用方。 */
  profile?: import('./plan').OutputProfileKind
  attemptChain?: import('./plan').OutputProfileKind[]
  transport: PlaybackTransport
  url: string
  mimeType?: string
  sessionId?: string
  generation?: number
  timeline: PlaybackTimelineDescriptor
}

/** Renderer Runtime 唯一持有的播放源租约。 */
export interface PlaybackSourceLease extends PlaybackSourceLeaseDescriptor {
  release: () => void
  markAttaching?: () => Promise<void>
  markPlayable?: () => Promise<void>
  markFailed?: (error: import('./errors').MediaCompatError) => Promise<void>
  /** 兼容播放可替换 generation；direct lease 不提供。 */
  seek?: (logicalTime: number) => Promise<PlaybackSourceLeaseDescriptor>
}
