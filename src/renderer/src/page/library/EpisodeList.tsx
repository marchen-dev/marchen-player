import type { DB_Library, DB_LibraryEpisode } from '@renderer/database/schemas/library'
import type { FC } from 'react'
import { showMatchAnimeDialog } from '@renderer/components/modules/player/loading/dialog/hooks'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@renderer/components/ui/menu'
import { db } from '@renderer/database/db'
import { cn, isWeb } from '@renderer/lib/utils'
import { RouteName } from '@renderer/router'
import { memo } from 'react'
import { useNavigate } from 'react-router'

interface EpisodeListProps {
  item: DB_Library
  onClose: () => void
}

export const EpisodeList: FC<EpisodeListProps> = memo(({ item, onClose }) => {
  const { episodes, watchedEpisodeIds, totalEpisodes } = item
  const navigate = useNavigate()
  const watchedCount = watchedEpisodeIds.length

  const handlePlay = (episode: DB_LibraryEpisode) => {
    if (!episode.fileHash || isWeb) return
    onClose()
    navigate(RouteName.PLAYER, { state: { hash: episode.fileHash } })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-medium">集数</h4>
        <span className="text-xs text-muted-foreground">
          {watchedCount}/{totalEpisodes}
        </span>
      </div>
      <div className="space-y-0.5">
        {episodes.map((ep) => (
          <EpisodeRow
            key={ep.episodeId}
            episode={ep}
            isWatched={watchedEpisodeIds.includes(ep.episodeId)}
            onPlay={handlePlay}
          />
        ))}
      </div>
    </div>
  )
})

interface EpisodeRowProps {
  episode: DB_LibraryEpisode
  isWatched: boolean
  onPlay: (episode: DB_LibraryEpisode) => void
}

const EpisodeRow: FC<EpisodeRowProps> = memo(({ episode, isWatched, onPlay }) => {
  const { episodeNumber, title, airDate, fileHash } = episode
  const hasFile = !!fileHash
  const dateLabel = airDate
    ? `${String(new Date(airDate).getMonth() + 1).padStart(2, '0')}-${String(new Date(airDate).getDate()).padStart(2, '0')}`
    : ''

  const rowContent = (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
        hasFile && 'cursor-default hover:bg-accent',
        !hasFile && 'opacity-50',
      )}
      onClick={() => hasFile && onPlay(episode)}
    >
      {/* 状态指示器 */}
      <span
        className={cn(
          'size-2 shrink-0 rounded-full',
          isWatched && 'bg-emerald-500',
          hasFile && !isWatched && 'bg-foreground/60',
          !hasFile && 'border border-muted-foreground/40',
        )}
      />
      {/* 集号 */}
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {episodeNumber}
      </span>
      {/* 标题 */}
      <span className="flex-1 truncate">{title}</span>
      {/* 日期 */}
      <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">
        {dateLabel}
      </span>
    </div>
  )

  if (!hasFile) return rowContent

  return (
    <ContextMenu>
      <ContextMenuTrigger>{rowContent}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onPlay(episode)}>播放</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => showMatchAnimeDialog(true, fileHash)}
        >
          重新匹配弹幕库
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => db.history.update(fileHash, { danmaku: undefined })}
        >
          清除弹幕缓存
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
})
