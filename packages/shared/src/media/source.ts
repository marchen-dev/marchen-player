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

export type DurableMediaSource =
  ElectronDurableMediaSource | WebDurableMediaSource | RemoteMediaSource
export type SerializableDurableMediaSource = ElectronDurableMediaSource | RemoteMediaSource

/** HISTORY 中只保存来源元信息；File 与临时播放 URL 不进入持久化层。 */
export type PersistentMediaSource =
  | RemoteMediaSource
  | { kind: 'electron-file'; path: string; name: string; size: number }
  | { kind: 'web-file'; name: string; size: number; lastModified?: number }
