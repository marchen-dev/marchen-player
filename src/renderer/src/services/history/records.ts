import type { DB_History } from '@renderer/database/schemas/history'
import type { DB_LibraryEpisode } from '@renderer/database/schemas/library'
import { isCompleted } from '@renderer/services/player-runtime/history/playback-history-adapter'

/**
 * 播放记录的界面视图模型。
 *
 * history 记录内嵌完整弹幕与字幕内容，单条可能很大；列表只需要下面这些字段，
 * 查询后立即映射成视图模型，避免 React 状态和 liveQuery 缓存长期持有大对象。
 */
export interface HistoryRecordView {
  hash: string
  title: string
  /** 优先播放关键帧，其次作品封面；都没有时由界面渲染占位 */
  image?: string
  /** 播放进度比例，0~1 */
  ratio: number
  /** 进度达到片长 90%，与影视库「已看」阈值一致 */
  completed: boolean
  /** 是否已匹配到作品与剧集 */
  matched: boolean
  /** 仅 Electron 本地文件有可在文件管理器中定位的路径 */
  localPath?: string
}

const FALLBACK_TITLE = '未知视频'

/** 已匹配显示「作品名 集名」，未匹配显示文件名（跳过匹配时 animeTitle 即文件名） */
function resolveTitle(record: DB_History, matched: boolean): string {
  const animeTitle = record.animeTitle?.trim() ?? ''
  const sourceName = record.source?.name?.trim() ?? ''
  if (!matched) return animeTitle || sourceName || FALLBACK_TITLE
  const episodeTitle = record.episodeTitle?.trim() ?? ''
  return [animeTitle, episodeTitle].filter(Boolean).join(' ') || sourceName || FALLBACK_TITLE
}

export function toHistoryRecordView(record: DB_History): HistoryRecordView {
  const matched = !!record.animeId && !!record.episodeId
  const progress = Number.isFinite(record.progress) ? Math.max(0, record.progress) : 0
  const duration = Number.isFinite(record.duration) ? Math.max(0, record.duration) : 0
  const source = record.source
  const localPath = source?.kind === 'electron-file' && source.path.trim() ? source.path : undefined

  return {
    hash: record.hash,
    title: resolveTitle(record, matched),
    image: record.thumbnail || record.cover || undefined,
    ratio: duration > 0 ? Math.min(1, progress / duration) : 0,
    completed: isCompleted(progress, duration),
    matched,
    localPath,
  }
}

/** 弹窗中的进度文案：看完显示「已看完」，尚无进度显示「未开始」 */
export function formatHistoryProgress(view: Pick<HistoryRecordView, 'ratio' | 'completed'>) {
  if (view.completed) return '已看完'
  const percent = Math.round(view.ratio * 100)
  return percent > 0 ? `${percent}%` : '未开始'
}

/**
 * 删除播放记录时解除影视库剧集与该文件的关联。
 * 没有剧集引用该文件时返回 null，调用方据此跳过无意义的写入。
 * 只清 fileHash：已看状态属于作品进度，不随文件记录消失。
 */
export function detachFileFromEpisodes(
  episodes: DB_LibraryEpisode[],
  fileHash: string,
): DB_LibraryEpisode[] | null {
  if (!episodes.some((ep) => ep.fileHash === fileHash)) return null
  return episodes.map((ep) => (ep.fileHash === fileHash ? { ...ep, fileHash: undefined } : ep))
}
