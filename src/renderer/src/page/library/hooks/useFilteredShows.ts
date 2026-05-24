import type { DB_Library } from '@renderer/database/schemas/library'
import type { CategoryCounts } from '../utils/shows'

import { useMemo } from 'react'
import { computeCounts, isCompleted, isWatching } from '../utils/shows'

/** Chips 过滤分类。'all' 表示不过滤。 */
export type LibraryFilter = 'all' | 'watching' | 'onair' | 'completed' | 'unstarted'

/** Sort 维度。 */
export type LibrarySort = 'recent' | 'title' | 'rating' | 'progress' | 'episodes' | 'date'

interface UseFilteredShowsArgs {
  shows: DB_Library[]
  filter: LibraryFilter
  search: string
  sort: LibrarySort
}

interface UseFilteredShowsResult {
  /** 过滤+排序后的作品列表，主区 Rail 渲染这个。 */
  filtered: DB_Library[]
  /** 各分类下的作品计数，给 Chips 显示徽标。 */
  counts: CategoryCounts
}

/**
 * 把 chip 过滤、search 模糊匹配、sort 排序三步组合成一个纯函数，
 * 通过 useMemo 缓存避免每次渲染都重算。
 *
 * 关键决策：
 * - search 是「在 chip 过滤后再过滤」：先按 chip 缩小集合，再用 search 在其中找。
 * - search 同时匹配 title 与 tags（不区分大小写）。
 * - sort 默认是 'recent'（按 lastWatchedAt 倒序），最常见的"我最近在看什么"语义。
 */
export function useFilteredShows({
  shows,
  filter,
  search,
  sort,
}: UseFilteredShowsArgs): UseFilteredShowsResult {
  const counts = useMemo(() => computeCounts(shows), [shows])

  const filtered = useMemo(() => {
    let s = shows

    // 1. chip 过滤
    if (filter === 'watching') s = s.filter(isWatching)
    else if (filter === 'completed') s = s.filter(isCompleted)
    else if (filter === 'onair') s = s.filter((x) => x.isOnAir)
    else if (filter === 'unstarted') s = s.filter((x) => x.watchedEpisodeIds.length === 0)

    // 2. search 模糊（title + tags）
    const q = search.trim().toLowerCase()
    if (q) {
      s = s.filter(
        (x) =>
          x.title.toLowerCase().includes(q) || x.tags.some((t) => t.toLowerCase().includes(q)),
      )
    }

    // 3. sort
    // 拷贝一份避免就地修改 useLiveQuery 返回的引用
    const sorted = [...s]
    switch (sort) {
      case 'recent':
        sorted.sort(
          (a, b) => new Date(b.lastWatchedAt).getTime() - new Date(a.lastWatchedAt).getTime(),
        )
        break
      case 'title':
        // 中文排序用 zh 区域，避免按 unicode 码点乱序
        sorted.sort((a, b) => a.title.localeCompare(b.title, 'zh'))
        break
      case 'rating':
        sorted.sort((a, b) => b.rating - a.rating)
        break
      case 'progress':
        sorted.sort((a, b) => {
          const pa = a.watchedEpisodeIds.length / Math.max(a.totalEpisodes, 1)
          const pb = b.watchedEpisodeIds.length / Math.max(b.totalEpisodes, 1)
          return pb - pa
        })
        break
      case 'episodes':
        sorted.sort((a, b) => b.totalEpisodes - a.totalEpisodes)
        break
      case 'date':
        sorted.sort((a, b) => new Date(b.airDate).getTime() - new Date(a.airDate).getTime())
        break
    }
    return sorted
  }, [shows, filter, search, sort])

  return { filtered, counts }
}
