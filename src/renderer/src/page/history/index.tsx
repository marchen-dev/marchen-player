import { TitleBarLayout } from '@renderer/components/layout/root/TitleBarLayout'
import { MatchDanmakuDialog } from '@renderer/components/modules/shared/MatchDanmakuDialog'
import { Badge } from '@renderer/components/ui/badge'
import { FunctionAreaButton } from '@renderer/components/ui/button'
import { ContextMenu, ContextMenuTrigger } from '@renderer/components/ui/menu'
import { ScrollArea } from '@renderer/components/ui/scrollArea'
import { db } from '@renderer/database/db'
import type { DB_Bangumi } from '@renderer/database/schemas/bangumi'
import { useConfirmationDialog } from '@renderer/hooks/use-dialog'
import { relativeTimeToNow } from '@renderer/initialize/date'
import { cn, isWeb } from '@renderer/lib/utils'
import { RouteName } from '@renderer/router'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Variants } from 'framer-motion'
import { m } from 'framer-motion'
import type { FC } from 'react'
import { memo, useMemo, useState } from 'react'
import { Link } from 'react-router'

export default function History() {
  const bangumiData = useLiveQuery(() =>
    db.bangumi.orderBy('updatedAt').limit(30).reverse().toArray(),
  )
  return (
    <TitleBarLayout FunctionArea={<FunctionArea />}>
      <ScrollArea className="mt-3 px-6">
        {bangumiData?.length !== 0 ? (
          <ul className={cn('grid-history-cols grid gap-3')}>
            {bangumiData?.map((item) => <HistoryItem {...item} key={item.animeId} />)}
          </ul>
        ) : (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-gray-500">
            <i className="icon-[mingcute--file-more-line] text-6xl " />
            <p className="text-xl">没有内容</p>
          </div>
        )}
      </ScrollArea>
      <MatchDanmakuDialog />
    </TitleBarLayout>
  )
}

const hoverVariant: Variants = {
  img: {
    opacity: 0.8,
    scale: 1.05,
  },
}

const HistoryItem: FC<DB_Bangumi> = memo((props) => {
  const episodeCount = useLiveQuery(() => db.history.where({ animeId: props.animeId }).count())
  const { updatedAt, cover, title, detail } = props
  const percentageOfMatchedEpisode = useMemo(() => {
    const percentage = (episodeCount ?? 0) / detail.episodes.length
    return Number.isFinite(percentage) && !Number.isNaN(percentage)
      ? Math.round(percentage * 100)
      : 0
  }, [detail.episodes.length, episodeCount])
  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <Link
          to={`${RouteName.HISTORY}/${props.animeId}`}
          className={cn(
            'flex size-full cursor-default select-none flex-col items-center',
            !isWeb && 'group',
          )}
        >
          <m.div
            className={cn('relative size-full overflow-hidden rounded-md ', 'aspect-auto h-72')}
            whileHover={['img']}
          >
            <HistoryImage src={cover} />
            <div
              className={cn('absolute bottom-0 left-0 h-1 rounded-md bg-warning')}
              style={{ width: `${percentageOfMatchedEpisode}%` }}
            />
          </m.div>
          <div className="mt-1.5 w-full px-0.5">
            <p className="truncate text-sm font-medium" title={title}>
              {title}
            </p>
            <div className="mt-0.5 flex items-center  text-zinc-500">
              <Badge variant={'outline'}>{relativeTimeToNow(updatedAt)}</Badge>
            </div>
          </div>
        </Link>
      </ContextMenuTrigger>
    </ContextMenu>
  )
})

const FunctionArea = memo(() => {
  const present = useConfirmationDialog()

  return (
    <div className="no-drag-region flex items-center space-x-2 text-2xl text-zinc-500 ">
      <FunctionAreaButton
        onClick={() =>
          present({
            title: '是否删除历史记录?',
            handleConfirm: () => {
              db.history.clear()
            },
          })
        }
      >
        <i className="icon-[mingcute--delete-2-line]" />
      </FunctionAreaButton>
    </div>
  )
})

interface HistoryImageProps {
  src?: string
}

const HistoryImage: FC<HistoryImageProps> = (props) => {
  const { src } = props
  const [imgError, setImgError] = useState(false)
  return (
    <m.div className="size-full border shadow-2xl" variants={{ img: hoverVariant.img }}>
      {!src || imgError ? (
        <div className="flex size-full items-center justify-center bg-gray-200 text-zinc-500 dark:bg-zinc-300">
          <span className="icon-[mingcute--pic-line] size-10 group-hover:hidden" />
        </div>
      ) : (
        <img
          src={src}
          className={cn(
            'pointer-events-none size-full object-cover opacity-100 transition-all duration-100',
          )}
          onError={() => {
            setImgError(true)
          }}
        />
      )}
    </m.div>
  )
}
