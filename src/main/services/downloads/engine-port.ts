import type { DownloadDraft, DownloadFile, DownloadPeer } from '@marchen/shared/downloads'
export interface EngineStats {
  id: string
  files: Array<Pick<DownloadFile, 'index' | 'verifiedBytes' | 'downloadedBytes' | 'complete'>>
  receivedBytes?: number
  hashFailures?: number
  downloadSpeed: number
  peers: number
  error?: string
}
export type EngineCommand =
  | { kind: 'prepare'; id: string; input: string | Uint8Array }
  | { kind: 'start'; id: string; metadata: Uint8Array; directory: string; selected: number[] }
  | { kind: 'peers'; id: string }
  | { kind: 'stop'; id: string }
  | { kind: 'limit'; bytes: number }
  | { kind: 'shutdown' }
export interface PreparedTorrent {
  draft: DownloadDraft
  metadata: Uint8Array
}
export interface DownloadEngine {
  prepare: (id: string, input: string | Uint8Array) => Promise<PreparedTorrent>
  start: (id: string, metadata: Uint8Array, directory: string, selected: number[]) => Promise<void>
  peers: (id: string) => Promise<DownloadPeer[]>
  stop: (id: string) => Promise<void>
  limit: (bytes: number) => Promise<void>
  shutdown: () => Promise<void>
}
export interface EngineRequest {
  requestId: string
  generation: string
  command: EngineCommand
}
export type EngineResponse =
  | {
      generation: string
      requestId: string
      ok: boolean
      value?: PreparedTorrent | DownloadPeer[]
      message?: string
    }
  | { generation: string; stats: EngineStats }

/**
 * 取不到具体原因时的简体中文说明，只用于日志与简体中文界面；
 * 其他语言下页面显示自己的概括说明（见 renderer 的 describeError）。
 */
// eslint-disable-next-line marchen/no-hardcoded-ui-text -- 给日志的中文兜底说明，不是界面文案
export const DOWNLOAD_FAILURE_FALLBACK = '下载操作失败'
