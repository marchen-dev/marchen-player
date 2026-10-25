import type { BrowseNode } from '@marchen/shared/media-sources'

export type BrowseView = 'grid' | 'list'

/**
 * 子节点主要是带海报的容器（媒体库、剧集、季）或电影时用海报网格，
 * 主要是视频、普通文件夹时用列表。只看当前层级，不读取服务器类型。
 */
export function pickBrowseView(nodes: readonly BrowseNode[]): BrowseView {
  if (nodes.length === 0) return 'list'
  const visual = nodes.filter(
    (node) =>
      node.type === 'collection' ||
      node.type === 'series' ||
      node.type === 'season' ||
      (node.type === 'video' && node.poster),
  ).length
  return visual * 2 > nodes.length ? 'grid' : 'list'
}

/** 秒 → 「24:10」或「1:52:03」 */
export function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function formatSize(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value >= 100 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`
}
