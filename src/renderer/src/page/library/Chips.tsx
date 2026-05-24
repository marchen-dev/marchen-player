import type { FC } from 'react'
import type { LibraryFilter } from './hooks/useFilteredShows'

import type { CategoryCounts } from './utils/shows'
import { cn } from '@renderer/lib/utils'

/**
 * Chips 过滤条。在主区上方提供 5 个分类切换：
 *   全部 / 在看 / 连载中 / 已看完 / 未开始
 *
 * 设计稿在 Chips 之外没有特别的"分类标签栏"，因此 chip 自身负责显示当前选中态。
 */
interface ChipsProps {
  filter: LibraryFilter
  counts: CategoryCounts
  onChange: (next: LibraryFilter) => void
}

/** 各 chip 的静态配置。提取出来便于复用与减少 JSX 重复。 */
const CHIP_ITEMS: { id: LibraryFilter; label: string; countKey: keyof CategoryCounts }[] = [
  { id: 'all', label: '全部', countKey: 'all' },
  { id: 'watching', label: '在看', countKey: 'watching' },
  { id: 'onair', label: '连载中', countKey: 'onair' },
  { id: 'completed', label: '已看完', countKey: 'completed' },
  { id: 'unstarted', label: '未开始', countKey: 'unstarted' },
]

export const Chips: FC<ChipsProps> = ({ filter, counts, onChange }) => {
  return (
    <div className="library-chips no-drag-region">
      {CHIP_ITEMS.map((it) => (
        <button
          key={it.id}
          type="button"
          className={cn('library-chip', filter === it.id && 'is-active')}
          onClick={() => onChange(it.id)}
        >
          <span>{it.label}</span>
          <span className="library-chip-count">{counts[it.countKey]}</span>
        </button>
      ))}
    </div>
  )
}
