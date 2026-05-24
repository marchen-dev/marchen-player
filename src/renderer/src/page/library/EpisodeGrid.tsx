import type { DB_Library, DB_LibraryEpisode } from '@renderer/database/schemas/library'
import type { FC } from 'react'
import { cn } from '@renderer/lib/utils'
import { memo, useMemo } from 'react'

/**
 * DetailOverlay 内的剧集网格。
 *
 * 每个 ep-tile 三种状态：
 *  - watched：已观看，标题变灰、集号显示完成色
 *  - is-next：首个未观看且有 fileHash 的下一集，accent 高亮 + NEXT 小标签
 *  - no-file：缺 fileHash（未关联本地文件），整体半透明且不可点击
 *
 * 网格列数由 `repeat(auto-fill, minmax(280px, 1fr))` 自动决定，剧场版（单集）也能优雅渲染。
 */
interface EpisodeGridProps {
  item: DB_Library
  onPlay: (episode: DB_LibraryEpisode) => void
}

export const EpisodeGrid: FC<EpisodeGridProps> = memo(({ item, onPlay }) => {
  // 已观看集合（O(1) 查询）
  const watchedSet = useMemo(() => new Set(item.watchedEpisodeIds), [item.watchedEpisodeIds])

  // 集数按 episodeNumber 升序，避免数据库写入顺序乱序导致显示混乱
  const sortedEpisodes = useMemo(
    () => [...item.episodes].sort((a, b) => a.episodeNumber - b.episodeNumber),
    [item.episodes],
  )

  // 下一集的 episodeId：首个未观看 且 有 fileHash 的剧集
  const nextEpisodeId = useMemo(
    () => sortedEpisodes.find((ep) => !watchedSet.has(ep.episodeId) && !!ep.fileHash)?.episodeId,
    [sortedEpisodes, watchedSet],
  )

  return (
    <div className="library-ep-grid">
      {sortedEpisodes.map((ep) => {
        const hasFile = !!ep.fileHash
        const watched = watchedSet.has(ep.episodeId)
        const isNext = ep.episodeId === nextEpisodeId

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
              <span className="library-ep-date">{formatDate(ep.airDate)}</span>
            )}
          </div>
        )
      })}
    </div>
  )
})

EpisodeGrid.displayName = 'EpisodeGrid'

/** 把 ISO 日期格式化为 "MM-DD"。空串或非法日期返回 ''。 */
function formatDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
