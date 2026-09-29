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
  seedingMs: 2 * 60 * 60 * 1000,
} as const

export type SeedPolicy = 'ratio-or-time' | 'stop' | 'forever'
export type DownloadState =
  'checking' | 'waiting' | 'downloading' | 'pausing' | 'paused' | 'seeding' | 'completed' | 'error'
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
  infoHash: string
  name: string
  directory: string
  files: DownloadFile[]
  intent: DownloadIntent
  state: DownloadState
  policy: SeedPolicy
  createdAt: number
  updatedAt: number
  completedAt?: number
  uploadedBytes: number
  /** 确认选集时冻结为选中文件逻辑大小，不含重复传输或邻接片段。 */
  ratioBaseBytes: number
  seedingMs: number
  error?: string
  downloadSpeed: number
  uploadSpeed: number
  peers: number
}
export interface DownloadSettings {
  directory: string
  uploadLimit: number // -1 表示不限速，正整数表示字节/秒
  policy: SeedPolicy
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

export function shouldStopSeeding(
  policy: SeedPolicy,
  uploaded: number,
  base: number,
  elapsed: number,
) {
  return (
    policy === 'stop' ||
    (policy === 'ratio-or-time' &&
      ((base > 0 && uploaded >= base) || elapsed >= DOWNLOAD_LIMITS.seedingMs))
  )
}
/** 跳过休眠或长时间调度中断，避免把未运行的时间计入做种。 */
export function seedingDelta(previous: number, now: number, active: boolean) {
  const delta = now - previous
  return active && delta >= 0 && delta <= 2000 ? delta : 0
}
