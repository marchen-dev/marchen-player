import type { DB_Library } from '@renderer/database/schemas/library'
import { RouterLayout } from '@renderer/components/layout/root/RouterLayout'
import { MatchDanmakuDialog } from '@renderer/components/modules/shared/MatchDanmakuDialog'
import { ScrollArea } from '@renderer/components/ui/scrollArea'
import { db } from '@renderer/database/db'
import { useLiveQuery } from 'dexie-react-hooks'
import { memo, useCallback, useMemo, useState } from 'react'

import { DetailSheet } from './DetailSheet'
import { FunctionArea } from './FunctionArea'
import { LibraryCard } from './LibraryCard'

export default function Library() {
  const [selectedAnime, setSelectedAnime] = useState<DB_Library | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const libraryData = useLiveQuery(() => db.library.orderBy('lastWatchedAt').reverse().toArray())

  const sortedData = useMemo(() => libraryData ?? [], [libraryData])

  const handleEnterSelect = useCallback(() => {
    setSelecting(true)
    setSelectedIds(new Set())
  }, [])

  const handleCancelSelect = useCallback(() => {
    setSelecting(false)
    setSelectedIds(new Set())
  }, [])

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(sortedData.map((item) => item.animeId)))
  }, [sortedData])

  const handleDeselectAll = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const handleToggleSelect = useCallback((animeId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(animeId)) {
        next.delete(animeId)
      } else {
        next.add(animeId)
      }
      return next
    })
  }, [])

  const handleDeleteSelected = useCallback(async () => {
    await db.library.bulkDelete([...selectedIds])
    setSelecting(false)
    setSelectedIds(new Set())
  }, [selectedIds])

  const handleClearAll = useCallback(async () => {
    await db.library.clear()
  }, [])

  return (
    <RouterLayout
      FunctionArea={
        <FunctionArea
          selecting={selecting}
          selectedCount={selectedIds.size}
          totalCount={sortedData.length}
          onEnterSelect={handleEnterSelect}
          onCancelSelect={handleCancelSelect}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
          onDeleteSelected={handleDeleteSelected}
          onClearAll={handleClearAll}
        />
      }
    >
      <ScrollArea className="h-full px-8">
        {sortedData.length !== 0 ? (
          <ul className="grid-auto-cols grid gap-2 gap-y-3">
            {sortedData.map((item) => (
              <LibraryCard
                key={item.animeId}
                item={item}
                selecting={selecting}
                selected={selectedIds.has(item.animeId)}
                onSelect={setSelectedAnime}
                onToggleSelect={handleToggleSelect}
              />
            ))}
          </ul>
        ) : (
          <EmptyState />
        )}
      </ScrollArea>
      <DetailSheet item={selectedAnime} onClose={() => setSelectedAnime(null)} />
      <MatchDanmakuDialog />
    </RouterLayout>
  )
}

const EmptyState = memo(() => (
  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-gray-500">
    <i className="icon-[mingcute--movie-line] text-6xl" />
    <p className="text-xl">影视库为空</p>
    <p className="mt-1 text-sm text-zinc-400">播放动画后会自动入库</p>
  </div>
))
