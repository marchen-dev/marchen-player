import { useCallback, useEffect, useState } from 'react'

interface UseManageStateArgs {
  /** 当前可见的所有作品 id，「全选」会选中所有这些 id。 */
  visibleIds: number[]
}

export interface ManageState {
  /** 是否处于 Manage 模式（批量选择/删除）。 */
  selecting: boolean
  /** 当前选中的 animeId 集合。 */
  selectedIds: Set<number>
  /** 已选中数量（便于在 TopBar 展示）。 */
  selectedCount: number
  /** 进入 Manage 模式（清空已选）。 */
  enterManage: () => void
  /** 退出 Manage 模式（清空已选）。 */
  cancelManage: () => void
  /** 切换单个作品的选中状态。 */
  toggleSelect: (animeId: number) => void
  /** 全选当前可见作品。 */
  selectAll: () => void
  /** 取消全选（清空选中，但仍在 Manage 模式）。 */
  deselectAll: () => void
}

/**
 * Manage 模式的状态机封装。
 *
 * 负责：
 *  - selecting / selectedIds 状态
 *  - 进入/退出 Manage 的状态切换
 *  - 单选切换、全选、取消全选
 *  - 全局监听 ESC：在 Manage 模式下按 ESC 自动退出
 *
 * 退出时无条件清空已选，避免再次进入 Manage 模式时残留上次的选择。
 */
export function useManageState({ visibleIds }: UseManageStateArgs): ManageState {
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const enterManage = useCallback(() => {
    setSelecting(true)
    setSelectedIds(new Set())
  }, [])

  const cancelManage = useCallback(() => {
    setSelecting(false)
    setSelectedIds(new Set())
  }, [])

  const toggleSelect = useCallback((animeId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(animeId)) next.delete(animeId)
      else next.add(animeId)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(visibleIds))
  }, [visibleIds])

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  // ESC 退出 Manage 模式。仅在 Manage 模式下生效，避免影响其他模态。
  useEffect(() => {
    if (!selecting) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelManage()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selecting, cancelManage])

  return {
    selecting,
    selectedIds,
    selectedCount: selectedIds.size,
    enterManage,
    cancelManage,
    toggleSelect,
    selectAll,
    deselectAll,
  }
}
