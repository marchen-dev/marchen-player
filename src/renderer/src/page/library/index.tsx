import type { DB_Library, DB_LibraryEpisode } from '@renderer/database/schemas/library'
import type { LibraryFilter, LibrarySort } from './hooks/useFilteredShows'
import { MatchDanmakuDialog } from '@renderer/components/modules/shared/MatchDanmakuDialog'
import { db } from '@renderer/database/db'
import { RouteName } from '@renderer/router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useMemo, useState } from 'react'

import { useNavigate } from 'react-router'
import { Chips } from './Chips'
import { ConfirmDialog } from './ConfirmDialog'
import { DetailOverlay } from './DetailOverlay'
import { EmptyState } from './EmptyState'
import { Hero } from './Hero'
import { useFilteredShows } from './hooks/useFilteredShows'
import { useManageState } from './hooks/useManageState'
import { LandscapeCard } from './LandscapeCard'
import { LibraryShell } from './LibraryShell'
import { PosterCard } from './PosterCard'
import { Rail } from './Rail'
import { Toast } from './Toast'
import { TopBar } from './TopBar'
import { pickContinueWatching, pickFeatured } from './utils/shows'

/**
 * library 路由入口。
 *
 * 职责：
 *  - 通过 useLiveQuery 订阅 IndexedDB library 表
 *  - 持有 search / filter / sort / selected (DetailOverlay) / confirm / toast 状态
 *  - 调用 useFilteredShows / useManageState 派生数据与状态机
 *  - 按渲染分支组装组件（EmptyState / manage / 默认 / 过滤后单 Rail）
 *  - 处理"播放某一集"统一跳转
 *
 * 不直接调用 db 的写入方法 in-line——所有 db 写入都包在 useCallback 内，
 * 便于阅读与未来抽测试。
 */
export default function Library() {
  const navigate = useNavigate()

  // ── 持久化数据 ─────────────────────────
  // useLiveQuery 第一次返回 undefined，等 IDB 读完后变成数组。
  // 这里用 ?? [] 兜底，避免下游各派生 useMemo 收到 undefined。
  const libraryData = useLiveQuery(() => db.library.toArray())
  const shows = useMemo<DB_Library[]>(() => libraryData ?? [], [libraryData])

  // ── UI 状态 ───────────────────────────
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<LibraryFilter>('all')
  const [sort, setSort] = useState<LibrarySort>('recent')

  /** DetailOverlay 打开的作品。null 表示不打开。 */
  const [selectedAnime, setSelectedAnime] = useState<DB_Library | null>(null)

  /** ConfirmDialog 数据：null 表示不打开。 */
  const [confirm, setConfirm] = useState<{
    title: string
    body?: string
    confirmLabel?: string
    danger?: boolean
    onConfirm: () => void
  } | null>(null)

  /** Toast 文案：null 表示不显示。 */
  const [toast, setToast] = useState<string | null>(null)

  // ── 派生数据 ───────────────────────────
  const { filtered, counts } = useFilteredShows({ shows, filter, search, sort })

  // featured 选择：优先在看里最近一部，兜底用 shows[0]
  const featured = useMemo(() => pickFeatured(shows), [shows])

  // 「继续观看」Rail 数据
  const continueWatching = useMemo(() => pickContinueWatching(shows), [shows])

  // Manage 模式状态机
  const visibleIds = useMemo(() => filtered.map((s) => s.animeId), [filtered])
  const manage = useManageState({ visibleIds })

  // ── 行为：播放某一集 ──────────────────
  /**
   * 统一的播放入口：关闭 detail，然后 navigate 到 /player。
   * 集数必须有 fileHash（上层应该确保已过滤），否则静默忽略避免崩溃。
   */
  const playEpisode = useCallback(
    (episode: DB_LibraryEpisode) => {
      if (!episode.fileHash) return
      setSelectedAnime(null)
      navigate(RouteName.PLAYER, { state: { hash: episode.fileHash } })
    },
    [navigate],
  )

  // ── 行为：Hero / 卡片点击 ───────────
  /**
   * 点击作品卡片：
   *  - Manage 模式 → 切换选中
   *  - 否则 → 打开 DetailOverlay
   */
  const onCardClick = useCallback(
    (item: DB_Library) => {
      if (manage.selecting) {
        manage.toggleSelect(item.animeId)
      } else {
        setSelectedAnime(item)
      }
    },
    [manage],
  )

  // ── 行为：弹 Toast（自动消失） ─────
  const showToast = useCallback((msg: string) => {
    setToast(msg)
    // 2.4s 后自动清空（与设计稿一致）
    setTimeout(() => {
      // 严格相等判断避免覆盖更新的 toast
      setToast((cur) => (cur === msg ? null : cur))
    }, 2400)
  }, [])

  // ── 行为：批量删除 ────────────────────
  const onDeleteSelected = useCallback(() => {
    const ids = [...manage.selectedIds]
    if (ids.length === 0) return
    setConfirm({
      title: `删除选中的 ${ids.length} 项？`,
      body: '这些作品将从影视库移除（不会删除本地文件）。',
      confirmLabel: '删除',
      danger: true,
      onConfirm: async () => {
        await db.library.bulkDelete(ids)
        manage.cancelManage()
        showToast(`已移除 ${ids.length} 项`)
      },
    })
  }, [manage, showToast])

  // ── 行为：清空全库 ────────────────────
  const onClearAll = useCallback(() => {
    if (shows.length === 0) return
    setConfirm({
      title: '清空影视库？',
      body: `这将移除全部 ${shows.length} 部作品（不会删除本地文件）。`,
      confirmLabel: '全部清空',
      danger: true,
      onConfirm: async () => {
        await db.library.clear()
        showToast('已清空影视库')
      },
    })
  }, [shows.length, showToast])

  // ── 渲染分支判定 ─────────────────────
  // 1. 库为空且非 Manage → EmptyState；TopBar 仅显示标题
  // 2. Manage 模式 → TopBar(manage) + 单条 Rail（所有作品）
  // 3. 默认（filter='all' && !search）→ Hero + Chips + 继续观看 + 所有作品
  // 4. 过滤态（chip != 'all' || search）→ Chips + 单条筛选结果 Rail
  const showEmptyState = shows.length === 0
  const showDefault = !manage.selecting && filter === 'all' && !search.trim()
  const showFiltered = !manage.selecting && (filter !== 'all' || !!search.trim())

  return (
    <LibraryShell
      topBar={
        <TopBar
          title="影视库"
          totalCount={shows.length}
          search={search}
          onSearchChange={setSearch}
          sort={sort}
          onSortChange={setSort}
          managing={manage.selecting}
          selectedCount={manage.selectedCount}
          onEnterManage={manage.enterManage}
          onCancelManage={manage.cancelManage}
          onSelectAll={manage.selectAll}
          onDeselectAll={manage.deselectAll}
          onDeleteSelected={onDeleteSelected}
          onClearAll={onClearAll}
        />
      }
    >
      {/* 1. 空库 */}
      {showEmptyState && <EmptyState variant="empty" />}

      {/* 2. Manage 模式：只显示 TopBar + 所有作品 Rail */}
      {!showEmptyState && manage.selecting && (
        <Rail title="管理 · 选择要删除的项目" sub={`LIBRARY · ${shows.length}`}>
          {shows.map((item) => (
            <PosterCard
              key={item.animeId}
              item={item}
              managing
              selected={manage.selectedIds.has(item.animeId)}
              onClick={() => onCardClick(item)}
            />
          ))}
        </Rail>
      )}

      {/* 3. 默认（无过滤）：Hero + Chips + 继续观看 + 所有作品 */}
      {!showEmptyState && showDefault && featured && (
        <>
          <Hero
            item={featured}
            onPlay={() => setSelectedAnime(featured)}
            onDetails={() => setSelectedAnime(featured)}
          />
          <Chips filter={filter} counts={counts} onChange={setFilter} />
          {continueWatching.length > 0 && (
            <Rail title="继续观看" sub="CONTINUE WATCHING">
              {continueWatching.map((item) => (
                <LandscapeCard
                  key={item.animeId}
                  item={item}
                  onClick={() => onCardClick(item)}
                />
              ))}
            </Rail>
          )}
          <Rail title="所有作品" sub={`LIBRARY · ${shows.length}`}>
            {shows.map((item) => (
              <PosterCard key={item.animeId} item={item} onClick={() => onCardClick(item)} />
            ))}
          </Rail>
        </>
      )}

      {/* 4. 过滤态：仅 Chips + 单条 Rail */}
      {!showEmptyState && showFiltered && (
        <>
          <Chips filter={filter} counts={counts} onChange={setFilter} />
          {filtered.length > 0 ? (
            <Rail
              title={filterLabel(filter)}
              sub={search ? `"${search}"` : filterSub(filter)}
            >
              {filtered.map((item) => (
                <PosterCard key={item.animeId} item={item} onClick={() => onCardClick(item)} />
              ))}
            </Rail>
          ) : (
            <EmptyState variant="no-match" />
          )}
        </>
      )}

      {/* DetailOverlay：仅在非 Manage 模式下打开 */}
      {selectedAnime && !manage.selecting && (
        <DetailOverlay
          item={selectedAnime}
          onClose={() => setSelectedAnime(null)}
          onPlayEpisode={playEpisode}
        />
      )}

      {/* ConfirmDialog：批量删除 / 清空全库共用 */}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onConfirm={confirm.onConfirm}
          onClose={() => setConfirm(null)}
        />
      )}

      {/* Toast：底部居中，2.4s 后自动消失 */}
      {toast && <Toast text={toast} />}

      {/* 保留全局"重新匹配弹幕"对话框挂载点（由 player 设置 Sheet 触发显示） */}
      <MatchDanmakuDialog />
    </LibraryShell>
  )
}

/** 过滤态 Rail 的中文标题。 */
function filterLabel(f: LibraryFilter): string {
  return (
    {
      all: '全部',
      watching: '在看',
      completed: '已看完',
      onair: '连载中',
      unstarted: '未开始',
    } as const
  )[f]
}

/** 过滤态 Rail 的英文副标题。 */
function filterSub(f: LibraryFilter): string {
  return (
    {
      all: 'ALL',
      watching: 'WATCHING',
      completed: 'COMPLETED',
      onair: 'ON AIR',
      unstarted: 'UNSTARTED',
    } as const
  )[f]
}
