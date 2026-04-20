import type { LoadingStatus } from '@renderer/atoms/player'
import type { FC } from 'react'
import { loadingDanmuProgressAtom } from '@renderer/atoms/player'
import { CompleteIcon } from '@renderer/components/icons/CompleteIcon'
import { cn } from '@renderer/lib/utils'
import { useAtomValue } from 'jotai'

const itemsTitle = ['视频导入', '计算哈希', '匹配动漫', '获取弹幕', '准备播放']
export const LoadingDanmuTimeLine = () => {
  const loadingProgress = useAtomValue(loadingDanmuProgressAtom)
  return (
    <div className="flex h-full items-center justify-center">
      {itemsTitle.map((item, index) => (
        <TimelineItem
          key={item}
          last={index === itemsTitle.length - 1}
          index={index}
          title={item}
          progress={loadingProgress}
        />
      ))}
    </div>
  )
}

interface TimelineProps {
  title: string
  index: number
  last: boolean
  progress: LoadingStatus | null
}

const TimelineItem: FC<TimelineProps> = (props) => {
  const { title, index, last, progress } = props
  const isHighLight = index <= (progress || 0)
  return (
    <>
      <div className="flex flex-col items-center gap-1">
        <CompleteIcon isHighLight={isHighLight} />
        <span className="text-sm select-none">{title}</span>
      </div>
      {!last && (
        <div className={cn('mx-2 mb-5 h-0.5 w-12', isHighLight ? 'bg-primary' : 'bg-muted')} />
      )}
    </>
  )
}
