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

/** 记录键与内容指纹分离，地址中的签名只用于访问。 */
export interface RemoteMediaSource extends DurableMediaIdentity {
  kind: 'remote-url'
  url: string
  fingerprint?: { algorithm: 'md5-prefix-16m'; value: string }
}

/**
 * 媒体源（WebDAV / Jellyfin / Emby）中的条目。身份由「来源 + 条目引用」决定，
 * 播放地址和凭证每次打开时由主进程重新解析，不进入持久化层。
 */
export interface ProviderMediaSource extends DurableMediaIdentity {
  kind: 'provider-item'
  sourceId: string
  provider: 'webdav' | 'jellyfin' | 'emby'
  /** WebDAV 为相对根地址的解码路径，Jellyfin/Emby 为 ItemId */
  itemRef: string
  fingerprint?: { algorithm: 'md5-prefix-16m'; value: string }
}

export type DurableMediaSource =
  ElectronDurableMediaSource | WebDurableMediaSource | RemoteMediaSource | ProviderMediaSource
export type SerializableDurableMediaSource =
  ElectronDurableMediaSource | RemoteMediaSource | ProviderMediaSource

export const PROVIDER_HISTORY_PREFIX = 'provider:'

/**
 * provider 条目的 HISTORY 主键是确定性的：同一条目再次打开时直接命中原记录，
 * 浏览列表也能用 bulkGet 批量查进度，不需要额外索引。
 */
export const providerHistoryKey = (sourceId: string, itemRef: string): string =>
  `${PROVIDER_HISTORY_PREFIX}${sourceId}:${encodeURIComponent(itemRef)}`

/** 需要经网络按需读取的来源；内嵌字幕提取、前缀复用等策略对两者一致。 */
export const isRemoteKind = (
  source: { kind: string } | undefined | null,
): source is RemoteMediaSource | ProviderMediaSource =>
  source?.kind === 'remote-url' || source?.kind === 'provider-item'

/** HISTORY 中只保存来源元信息；File 与临时播放 URL 不进入持久化层。 */
export type PersistentMediaSource =
  | RemoteMediaSource
  | ProviderMediaSource
  | { kind: 'electron-file'; path: string; name: string; size: number }
  | { kind: 'web-file'; name: string; size: number; lastModified?: number }
