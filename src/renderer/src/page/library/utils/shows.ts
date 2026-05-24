import type { DB_Library } from '@renderer/database/schemas/library'

/**
 * 判定作品是否处于「在看」状态：已观看至少一集，但还没完结。
 */
export function isWatching(item: DB_Library): boolean {
  return item.watchedEpisodeIds.length > 0 && item.watchedEpisodeIds.length < item.totalEpisodes
}

/**
 * 判定作品是否处于「已看完」状态：观看集数已达到或超过总集数（必须有总集数）。
 */
export function isCompleted(item: DB_Library): boolean {
  return item.totalEpisodes > 0 && item.watchedEpisodeIds.length >= item.totalEpisodes
}

/**
 * 派生当前的 watched count，与 `watchedEpisodeIds.length` 等价。
 * 抽出语义化的 helper 方便复用。
 */
export function watchedCount(item: DB_Library): number {
  return item.watchedEpisodeIds.length
}

/**
 * 选出 Hero featured 作品的列表（按 lastWatchedAt 倒序、仅取「在看」），
 * 设计稿原本最多取 5 部用于轮播；本变更不轮播，但保留派生列表以便未来扩展。
 */
export function pickHeroShows(shows: DB_Library[]): DB_Library[] {
  return [...shows]
    .filter(isWatching)
    .sort((a, b) => new Date(b.lastWatchedAt).getTime() - new Date(a.lastWatchedAt).getTime())
    .slice(0, 5)
}

/**
 * Hero 实际渲染的单个 featured。优先在「在看」中按最近观看选第一部；
 * 若没有「在看」则兜底到作品列表的第一部（避免 Hero 空白）。
 * 库为空时返回 null，上游应直接渲染 EmptyState。
 */
export function pickFeatured(shows: DB_Library[]): DB_Library | null {
  if (shows.length === 0) return null
  const heroShows = pickHeroShows(shows)
  return heroShows[0] ?? shows[0]
}

/**
 * 取「继续观看」Rail 的数据：所有「在看」作品，按 lastWatchedAt 倒序。
 */
export function pickContinueWatching(shows: DB_Library[]): DB_Library[] {
  return [...shows]
    .filter(isWatching)
    .sort((a, b) => new Date(b.lastWatchedAt).getTime() - new Date(a.lastWatchedAt).getTime())
}

/**
 * 计算每个过滤分类下的作品数（供 Chips 显示徽标）。
 */
export interface CategoryCounts {
  all: number
  watching: number
  onair: number
  completed: number
  unstarted: number
}

export function computeCounts(shows: DB_Library[]): CategoryCounts {
  return {
    all: shows.length,
    watching: shows.filter(isWatching).length,
    onair: shows.filter((s) => s.isOnAir).length,
    completed: shows.filter(isCompleted).length,
    unstarted: shows.filter((s) => s.watchedEpisodeIds.length === 0).length,
  }
}

/**
 * 找出作品下一集应播放的剧集（按 episodeNumber 升序找第一个 not in watchedEpisodeIds 的）。
 * 用于 Hero / DetailOverlay 主 CTA「继续观看 · 第 XX 话」。
 */
export function pickNextEpisode(item: DB_Library) {
  const watched = new Set(item.watchedEpisodeIds)
  return [...item.episodes]
    .sort((a, b) => a.episodeNumber - b.episodeNumber)
    .find((ep) => !watched.has(ep.episodeId))
}

/**
 * 主 CTA 的文案：未开始用「开始观看」，已观看用「继续观看 · 第 XX 话」（集号补零至 2 位）。
 */
export function ctaLabel(item: DB_Library): string {
  if (item.watchedEpisodeIds.length === 0) return '开始观看'
  const next = pickNextEpisode(item)
  // 没有下一集（全部看完）时仍标作「继续观看」但不带集号
  if (!next) return '继续观看'
  return `继续观看 · 第${String(next.episodeNumber).padStart(2, '0')}话`
}
