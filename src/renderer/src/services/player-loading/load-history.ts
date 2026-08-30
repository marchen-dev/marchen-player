import type { DB_History } from '@renderer/database/schemas/history'
import type { PlayerLoadingService } from '@renderer/services/player-loading'
import { db } from '@renderer/database/db'
import { markNextPlayerImportSource } from '@renderer/services/telemetry/player-loading-observer'

export type HistoricalVideoLoadResult =
  | { status: 'loaded'; path: string }
  | { status: 'missing-record' }
  | { status: 'missing-path' }
  | { status: 'error'; error: unknown }

interface HistoryReader {
  get: (hash: string) => PromiseLike<DB_History | undefined>
}

interface HistoricalVideoLoaderDeps {
  history?: HistoryReader
  service: Pick<PlayerLoadingService, 'loadFromPath'>
}

/**
 * 首页和 library 路由共同使用的历史加载入口。
 * 这里只解析本地路径，实际 hash、匹配和进度恢复仍由既有加载/播放链路负责。
 */
export async function loadHistoricalVideo(
  hash: string,
  { history = db.history, service }: HistoricalVideoLoaderDeps,
): Promise<HistoricalVideoLoadResult> {
  try {
    const record = await history.get(hash)
    if (!record) return { status: 'missing-record' }
    if (!record.path?.trim()) return { status: 'missing-path' }

    markNextPlayerImportSource('library')
    service.loadFromPath(record.path)
    return { status: 'loaded', path: record.path }
  } catch (error) {
    return { status: 'error', error }
  }
}
