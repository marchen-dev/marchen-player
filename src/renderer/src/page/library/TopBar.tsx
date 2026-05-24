import type { FC } from 'react'
import type { LibrarySort } from './hooks/useFilteredShows'
import { cn } from '@renderer/lib/utils'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MoreMenu } from './MoreMenu'
import { SearchPill } from './SearchPill'
import { SortMenu } from './SortMenu'

/**
 * library 顶部工具栏。
 *
 * 两种态：
 *  - normal：标题 + 计数 + Search + Sort + More 三组按钮
 *  - manage：取消 + 选中计数 + 全选/取消全选 + 删除 (N)
 *
 * 同时只允许打开一个弹出菜单（sort 或 more）；点击菜单外部关闭。
 * TopBar 容器自身可以被拖拽窗口（CSS `pointer-events: none` 让背景层渗透 drag-region），
 * 内部按钮统一加 no-drag-region 确保可点击。
 *
 * 空库时（totalCount === 0 且非 manage）：仅显示标题，隐藏所有按钮。
 */
interface TopBarProps {
  title: string
  /** 当前作品总数（用于"影视库 N"显示与空库判定） */
  totalCount: number

  // ── search/sort 受控 ─────────────────────
  search: string
  onSearchChange: (next: string) => void
  sort: LibrarySort
  onSortChange: (next: LibrarySort) => void

  // ── manage 模式相关 ──────────────────────
  managing: boolean
  selectedCount: number
  onEnterManage: () => void
  onCancelManage: () => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onDeleteSelected: () => void

  // ── more menu 行为 ───────────────────────
  onClearAll: () => void
}

type OpenMenu = 'sort' | 'more' | null

export const TopBar: FC<TopBarProps> = ({
  title,
  totalCount,
  search,
  onSearchChange,
  sort,
  onSortChange,
  managing,
  selectedCount,
  onEnterManage,
  onCancelManage,
  onSelectAll,
  onDeselectAll,
  onDeleteSelected,
  onClearAll,
}) => {
  const [open, setOpen] = useState<OpenMenu>(null)
  const sortRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLDivElement>(null)

  // 点击菜单外关闭。仅在有菜单打开时挂监听，避免常驻 listener。
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node
      if (sortRef.current?.contains(target)) return
      if (moreRef.current?.contains(target)) return
      setOpen(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // ESC 关闭菜单（与 useManageState 内的 ESC 退出 manage 并行，互不冲突）
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const toggleMenu = useCallback((which: 'sort' | 'more') => {
    setOpen((prev) => (prev === which ? null : which))
  }, [])

  // ── manage 模式：变形为批量操作工具栏 ──
  if (managing) {
    const allSelected = selectedCount === totalCount && totalCount > 0
    return (
      <div className="library-topbar library-topbar-manage">
        <button type="button" className="library-btn-text no-drag-region" onClick={onCancelManage}>
          <CrossGlyph />
          取消
        </button>
        <div className="library-topbar-title">
          选中 <span className="library-tabular library-accent-text">{selectedCount}</span>
          <span className="library-muted"> / {totalCount}</span>
        </div>
        <div className="library-manage-spacer" />
        <button
          type="button"
          className="library-btn-text no-drag-region"
          onClick={allSelected ? onDeselectAll : onSelectAll}
        >
          {allSelected ? '取消全选' : '全选'}
        </button>
        <button
          type="button"
          className="library-btn-delete no-drag-region"
          disabled={selectedCount === 0}
          onClick={onDeleteSelected}
        >
          <TrashGlyph />
          删除{selectedCount > 0 ? ` (${selectedCount})` : ''}
        </button>
      </div>
    )
  }

  // ── 空库：仅标题 ──
  if (totalCount === 0) {
    return (
      <div className="library-topbar drag-region">
        <div className="library-topbar-title">
          {title} <span className="library-muted">{totalCount}</span>
        </div>
      </div>
    )
  }

  // ── normal 态 ──
  return (
    <div className="library-topbar drag-region">
      <div className="library-topbar-title">
        {title} <span className="library-muted">{totalCount}</span>
      </div>

      <SearchPill value={search} onChange={onSearchChange} />

      <div className="library-menu-wrap no-drag-region" ref={sortRef}>
        <button
          type="button"
          className={cn('library-icon-btn', open === 'sort' && 'is-open')}
          aria-label="排序"
          aria-haspopup="menu"
          aria-expanded={open === 'sort'}
          onClick={() => toggleMenu('sort')}
        >
          <SortGlyph />
        </button>
        {open === 'sort' && (
          <SortMenu
            value={sort}
            onChange={(v) => {
              onSortChange(v)
              setOpen(null)
            }}
          />
        )}
      </div>

      <div className="library-menu-wrap no-drag-region" ref={moreRef}>
        <button
          type="button"
          className={cn('library-icon-btn', open === 'more' && 'is-open')}
          aria-label="更多"
          aria-haspopup="menu"
          aria-expanded={open === 'more'}
          onClick={() => toggleMenu('more')}
        >
          <MoreGlyph />
        </button>
        {open === 'more' && (
          <MoreMenu
            onManage={() => {
              onEnterManage()
              setOpen(null)
            }}
            onClearAll={() => {
              onClearAll()
              setOpen(null)
            }}
          />
        )}
      </div>
    </div>
  )
}

function CrossGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function TrashGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SortGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6h16M7 12h10M10 18h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function MoreGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  )
}
