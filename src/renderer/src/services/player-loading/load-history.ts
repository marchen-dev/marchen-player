import type { DB_History } from '@renderer/database/schemas/history'
import type { PlayerLoadingService } from '@renderer/services/player-loading'
import { calculateFileHash } from '@marchen/shared/lib/calc-file-hash'
import { db } from '@renderer/database/db'
import { markNextPlayerImportSource } from '@renderer/services/telemetry/player-loading-observer'

export type HistoricalVideoLoadResult =
  | { status: 'loaded'; path: string }
  | { status: 'cancelled' }
  | { status: 'missing-record' }
  | { status: 'missing-path' }
  | { status: 'error'; error: unknown }

interface HistoryReader {
  get: (hash: string) => PromiseLike<DB_History | undefined>
}

interface HistoricalVideoLoaderDeps {
  history?: HistoryReader
  service: Pick<PlayerLoadingService, 'loadFromPath'> &
    Partial<Pick<PlayerLoadingService, 'loadFromFile'>>
  selectFile?: () => Promise<File | null>
}

/**
 * 首页和 library 路由共同使用的历史加载入口。
 * 这里只恢复已授权来源，实际 hash、匹配和进度恢复仍由统一加载/播放链路负责。
 */
export async function loadHistoricalVideo(
  hash: string,
  { history = db.history, service, selectFile = selectHistoricalFile }: HistoricalVideoLoaderDeps,
): Promise<HistoricalVideoLoadResult> {
  try {
    const record = await history.get(hash)
    if (!record) return { status: 'missing-record' }
    if (record.source?.kind === 'web-file') {
      let file: File | null = null
      try {
        file = (await record.source.handle?.getFile()) ?? null
      } catch {
        /* 授权失效后重新选择。 */
      }
      if (!file) file = await selectFile()
      if (!file) return { status: 'cancelled' }
      if (file.size !== record.source.size || (await calculateFileHash(file)) !== hash)
        throw new Error('选择的文件与播放记录不一致')
      if (!service.loadFromFile) throw new Error('当前加载器不支持 Web 文件')
      markNextPlayerImportSource('library')
      service.loadFromFile(file)
      return { status: 'loaded', path: file.name }
    }
    const path = record.source?.kind === 'electron-file' ? record.source.path : undefined
    if (!path?.trim()) return { status: 'missing-path' }

    markNextPlayerImportSource('library')
    service.loadFromPath(path)
    return { status: 'loaded', path }
  } catch (error) {
    return { status: 'error', error }
  }
}

function selectHistoricalFile() {
  return new Promise<File | null>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.mp4,.mkv'
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true })
    input.addEventListener('cancel', () => resolve(null), { once: true })
    input.click()
  })
}
