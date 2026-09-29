/** 下载数据只经 IPC 传递；磁力、目录及种子内容不得进入遥测。 */
export const DOWNLOAD_LIMITS = {
  tasks: 200,
  drafts: 8,
  torrentBytes: 8 * 1024 * 1024,
  magnetChars: 16 * 1024,
  files: 10000,
  pathDepth: 32,
  metadataMs: 60000,
  stopMs: 15000,
  checkpointMs: 5000,
} as const

export type DownloadState =
  'checking' | 'waiting' | 'downloading' | 'pausing' | 'paused' | 'completed' | 'error'
export type DownloadIntent = 'running' | 'paused' | 'stopped'
export interface DownloadFile {
  index: number
  path: string
  size: number
  selected: boolean
  verifiedBytes: number
  complete: boolean
}
export interface DownloadTask {
  id: string
  infoHash?: string
  http?: {
    url: string
    urlChain: string[]
    partialName: string
    offset: number
    etag: string
    lastModified: string
  }
  name: string
  directory: string
  files: DownloadFile[]
  intent: DownloadIntent
  state: DownloadState
  createdAt: number
  updatedAt: number
  completedAt?: number
  /** 当前选中文件逻辑大小，修改选集时重新计算，不含重复传输或邻接片段。 */
  selectedBytes: number
  error?: string
  downloadSpeed: number
  peers: number
}
export interface DownloadSettings {
  directory: string
  uploadLimit: number // -1 表示不限速，正整数表示字节/秒
}
export interface DownloadSnapshot {
  revision: number
  tasks: DownloadTask[]
  settings: DownloadSettings
  error?: string
}
export interface DownloadDraft {
  id: string
  infoHash: string
  name: string
  files: Array<{ index: number; path: string; size: number }>
  existingTaskId?: string
}
export type DownloadInput = { kind: 'magnet'; value: string } | { kind: 'torrent'; path: string }
export type DownloadErrorCode =
  'INVALID_INPUT' | 'UNSUPPORTED_FORMAT' | 'STORAGE_ERROR' | 'ENGINE_ERROR' | 'TIMEOUT' | 'IN_USE'
export type DownloadResult<T> = { ok: true; value: T } | { ok: false; message: string }

/** 节点明细仅按需读取，不持久化地址与连接统计。 */
export interface DownloadPeer {
  id: string
  address: string
  downloadSpeed: number
  uploadSpeed: number
  downloaded: number
  uploaded: number
  availablePercent: number | null
  state: 'downloading' | 'choked' | 'ready' | 'unneeded'
}
