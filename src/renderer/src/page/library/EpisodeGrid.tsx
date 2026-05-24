import type { DB_Library, DB_LibraryEpisode } from '@renderer/database/schemas/library'
import type { FC } from 'react'
import { db } from '@renderer/database/db'
import { cn } from '@renderer/lib/utils'
import { useLiveQuery } from 'dexie-react-hooks'
import { memo, useMemo } from 'react'

/**
 * DetailOverlay 内的剧集网格。
 *
 * 每集右列四态：watched/≥95% → ✓、有进度 → NN%、其余 → —。
 * 「接着看哪集」由 Hero CTA 表达，列表本身不再标 NEXT。
 */
interface EpisodeGridProps {
  item: DB_Library
  onPlay: (episode: DB_LibraryEpisode) => void
}

export const EpisodeGrid: FC<EpisodeGridProps> = memo(({ item, onPlay }) => {
  const watchedSet = useMemo(() => new Set(item.watchedEpisodeIds), [item.watchedEpisodeIds])

  const sortedEpisodes = useMemo(
    () => [...item.episodes].sort((a, b) => a.episodeNumber - b.episodeNumber),
    [item.episodes],
  )

  const progressMap = useLiveQuery(async () => {
    const hashes = sortedEpisodes.map((ep) => ep.fileHash).filter((h): h is string => !!h)
    if (hashes.length === 0) return new Map<string, number>()
    const records = await db.history.bulkGet(hashes)
    const map = new Map<string, number>()
    for (const r of records) {
      if (!r || !r.duration || r.duration <= 0) continue
      map.set(r.hash, Math.min(1, Math.max(0, r.progress / r.duration)))
    }
    return map
  }, [sortedEpisodes])

  return (
    <div className="library-ep-grid">
      {sortedEpisodes.map((ep) => {
        const hasFile = !!ep.fileHash
        const watched = watchedSet.has(ep.episodeId)
        const ratio = hasFile ? progressMap?.get(ep.fileHash!) ?? 0 : 0
        const pct = Math.round(ratio * 100)

        return (
          <div
            key={ep.episodeId}
            className={cn(
              'library-ep-tile',
              hasFile && 'has-file',
              !hasFile && 'no-file',
              watched && 'watched',
            )}
            onClick={() => hasFile && onPlay(ep)}
            role={hasFile ? 'button' : undefined}
            tabIndex={hasFile ? 0 : -1}
            onKeyDown={(e) => {
              if (hasFile && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault()
                onPlay(ep)
              }
            }}
          >
            <span className="library-ep-num">{String(ep.episodeNumber).padStart(2, '0')}</span>
            <span className="library-ep-title" title={ep.title}>
              {ep.title}
            </span>
            <span
              className={cn(
                'library-ep-progress',
                (pct >= 95 || (watched && pct < 1)) && 'is-watched',
              )}
              aria-label={
                pct >= 95 ? '已看完' : pct >= 1 ? `已观看 ${pct}%` : watched ? '已看完' : '未开始'
              }
            >
              {pct >= 95 ? '✓' : pct >= 1 ? `${pct}%` : watched ? '✓' : '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
})

EpisodeGrid.displayName = 'EpisodeGrid'
