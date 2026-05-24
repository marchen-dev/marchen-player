import type { DB_Library, DB_LibraryEpisode } from '@renderer/database/schemas/library'
import type { FC } from 'react'
import { db } from '@renderer/database/db'
import { cn } from '@renderer/lib/utils'
import { useLiveQuery } from 'dexie-react-hooks'
import { memo, useMemo } from 'react'

/**
 * DetailOverlay 内的剧集网格。
 *
 * 每集右列三态：watched → ✓、有进度 → NN%、其余 → —。
 * NEXT 标签优先级最高，占用右列时不显示进度。
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

  const nextEpisodeId = useMemo(
    () => sortedEpisodes.find((ep) => !watchedSet.has(ep.episodeId) && !!ep.fileHash)?.episodeId,
    [sortedEpisodes, watchedSet],
  )

  // 按 fileHash 批量拉 history，得到每集 0~1 进度比例
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
        const isNext = ep.episodeId === nextEpisodeId
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
              isNext && 'is-next',
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
            {isNext ? (
              <span className="library-ep-next-pill">NEXT</span>
            ) : (
              <span
                className={cn('library-ep-progress', watched && 'is-watched')}
                aria-label={watched ? '已看完' : pct > 0 ? `已观看 ${pct}%` : '未开始'}
              >
                {watched ? '✓' : pct >= 1 ? `${pct}%` : '—'}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
})

EpisodeGrid.displayName = 'EpisodeGrid'
