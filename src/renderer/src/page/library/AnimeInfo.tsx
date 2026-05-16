import type { DB_Library } from '@renderer/database/schemas/library'
import type { FC } from 'react'
import { Badge } from '@renderer/components/ui/badge'
import { memo, useState } from 'react'

interface AnimeInfoProps {
  item: DB_Library
}

export const AnimeInfo: FC<AnimeInfoProps> = memo(({ item }) => {
  const { imageUrl, typeDescription, totalEpisodes, airDate, rating, tags, summary, intro } = item
  const [expanded, setExpanded] = useState(false)

  const year = airDate ? new Date(airDate).getFullYear() : ''
  const month = airDate ? new Date(airDate).getMonth() + 1 : ''
  const dateLabel = year && month ? `${year}年${month}月` : ''

  return (
    <div className="space-y-3">
      {/* 头部：海报 + 元信息 */}
      <div className="flex gap-3">
        <div className="w-20 shrink-0 overflow-hidden rounded-md">
          {imageUrl ? (
            <img src={imageUrl} className="size-full object-cover" />
          ) : (
            <div className="flex aspect-[2/3] items-center justify-center bg-zinc-100 dark:bg-zinc-800">
              <i className="icon-[mingcute--movie-line] size-6 text-zinc-400" />
            </div>
          )}
        </div>
        <div className="flex flex-col justify-center gap-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {typeDescription && <span>{typeDescription}</span>}
            {totalEpisodes > 0 && (
              <>
                <span>·</span>
                <span>{totalEpisodes}话</span>
              </>
            )}
            {dateLabel && (
              <>
                <span>·</span>
                <span>{dateLabel}</span>
              </>
            )}
          </div>
          {rating > 0 && (
            <div className="flex items-center gap-1 text-sm">
              <span className="text-amber-500">★</span>
              <span className="font-medium">{rating.toFixed(1)}</span>
            </div>
          )}
        </div>
      </div>

      {/* 标签 */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[11px] px-1.5 py-0">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* 简介 */}
      {summary && (
        <div>
          <p
            className={`text-xs text-muted-foreground leading-relaxed whitespace-pre-line ${!expanded ? 'line-clamp-3' : ''}`}
          >
            {summary.split('[简介原文]')[0].trim()}
          </p>
          {summary.length > 100 && (
            <button
              className="text-xs text-primary mt-0.5 cursor-default"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? '收起' : '展开'}
            </button>
          )}
        </div>
      )}

      {/* 制作信息 */}
      {intro && (
        <p className="text-[11px] text-muted-foreground/70">{intro}</p>
      )}

      <div className="border-b border-border" />
    </div>
  )
})
