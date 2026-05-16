import type { DB_Library } from '@renderer/database/schemas/library'
import type { FC } from 'react'
import { Badge } from '@renderer/components/ui/badge'
import { Checkbox } from '@renderer/components/ui/checkbox'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@renderer/components/ui/menu'
import { db } from '@renderer/database/db'
import { useConfirmationDialog } from '@renderer/hooks/use-dialog'
import { cn } from '@renderer/lib/utils'
import { m } from 'framer-motion'
import { memo, useState } from 'react'

interface LibraryCardProps {
  item: DB_Library
  selecting: boolean
  selected: boolean
  onSelect: (item: DB_Library) => void
  onToggleSelect: (animeId: number) => void
}

export const LibraryCard: FC<LibraryCardProps> = memo(
  ({ item, selecting, selected, onSelect, onToggleSelect }) => {
    const { title, imageUrl, totalEpisodes, watchedEpisodeIds, isOnAir, animeId } = item
    const watchedCount = watchedEpisodeIds.length
    const percentage = totalEpisodes > 0 ? Math.round((watchedCount / totalEpisodes) * 100) : 0
    const isCompleted = totalEpisodes > 0 && watchedCount >= totalEpisodes
    const present = useConfirmationDialog()

    const handleClick = () => {
      if (selecting) {
        onToggleSelect(animeId)
      } else {
        onSelect(item)
      }
    }

    const cardContent = (
      <li
        className="group flex size-full cursor-default flex-col items-center select-none"
        onClick={handleClick}
      >
        <m.div
          className="relative aspect-[2/3] size-full overflow-hidden rounded-lg"
          whileHover={{ scale: selecting ? 1 : 1.02 }}
          transition={{ duration: 0.15 }}
        >
          <CardImage src={imageUrl} />
          {selecting && (
            <div
              className="absolute top-1.5 left-1.5 z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <Checkbox
                checked={selected}
                onCheckedChange={() => onToggleSelect(animeId)}
                className="size-5 border-2 border-white bg-black/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
            </div>
          )}
          {!selecting && isOnAir && (
            <Badge
              variant="secondary"
              className="absolute top-1.5 right-1.5 bg-amber-500/90 px-1.5 py-0 text-[10px] text-white"
            >
              连载中
            </Badge>
          )}
          {totalEpisodes > 0 && (
            <div className="absolute right-0 bottom-0 left-0 h-1 bg-zinc-200/50 dark:bg-zinc-700/50">
              <div
                className={cn(
                  'h-full rounded-r-sm transition-all',
                  isCompleted ? 'bg-emerald-500' : 'bg-amber-500',
                )}
                style={{ width: `${percentage}%` }}
              />
            </div>
          )}
        </m.div>
        <div className="mt-1.5 w-full px-0.5">
          <p className="truncate text-sm font-medium" title={title}>
            {title}
          </p>
          {totalEpisodes > 0 && (
            <p className="text-muted-foreground text-xs">
              {watchedCount}/{totalEpisodes}
            </p>
          )}
        </div>
      </li>
    )

    if (selecting) return cardContent

    return (
      <ContextMenu>
        <ContextMenuTrigger>{cardContent}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => onSelect(item)}>查看详情</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className="!text-secondary"
            onClick={() =>
              present({
                title: '确定从影视库中移除？',
                handleConfirm: () => db.library.delete(animeId),
              })
            }
          >
            从库中移除
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    )
  },
)

const CardImage: FC<{ src?: string }> = ({ src }) => {
  const [imgError, setImgError] = useState(false)

  if (!src || imgError) {
    return (
      <div className="flex size-full items-center justify-center bg-zinc-100 text-zinc-400 dark:bg-zinc-800">
        <i className="icon-[mingcute--movie-line] size-10" />
      </div>
    )
  }

  return (
    <img
      src={src}
      className="pointer-events-none size-full object-cover"
      onError={() => setImgError(true)}
    />
  )
}
