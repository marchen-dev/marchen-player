import type { FC } from 'react'
import type { LibrarySort } from './hooks/useFilteredShows'

import { cn } from '@renderer/lib/utils'

/**
 * Sort 弹出菜单。6 维排序维度：
 *   最近观看 / 标题 / 评分 / 观看进度 / 集数 / 播出年份
 *
 * 菜单本身不管理打开/关闭与点击外部关闭逻辑——这些由父组件 TopBar 控制
 * （以便统一处理同时只能打开一个菜单的限制）。
 */
interface SortMenuProps {
  value: LibrarySort
  onChange: (next: LibrarySort) => void
}

const ITEMS: { id: LibrarySort; label: string; hint: string }[] = [
  { id: 'recent', label: '最近观看', hint: 'Recent' },
  { id: 'title', label: '标题', hint: 'A–Z' },
  { id: 'rating', label: '评分', hint: 'Rating' },
  { id: 'progress', label: '观看进度', hint: 'Progress' },
  { id: 'episodes', label: '集数', hint: 'Episodes' },
  { id: 'date', label: '播出年份', hint: 'Year' },
]

export const SortMenu: FC<SortMenuProps> = ({ value, onChange }) => {
  return (
    <div className="library-menu-popover" role="menu">
      <div className="library-menu-section">排序 · SORT BY</div>
      {ITEMS.map((it) => (
        <button
          key={it.id}
          type="button"
          role="menuitemradio"
          aria-checked={value === it.id}
          className={cn('library-menu-item', value === it.id && 'is-on')}
          onClick={() => onChange(it.id)}
        >
          <span className="library-menu-check">{value === it.id && <CheckGlyph />}</span>
          <span className="library-menu-label">{it.label}</span>
          <span className="library-menu-hint">{it.hint}</span>
        </button>
      ))}
    </div>
  )
}

function CheckGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12l5 5L20 7"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
