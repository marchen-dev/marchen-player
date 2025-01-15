import type { LoadingStatus } from '@renderer/atoms/player'
import { loadingDanmuProgressAtom } from '@renderer/atoms/player'
import { CompleteIcon } from '@renderer/components/icons/CompleteIcon'
import { cn } from '@renderer/lib/utils'
import { useAtomValue } from 'jotai'
import type { FC } from 'react'

const itemsTitle = ['视频导入', '计算哈希', '匹配动漫', '获取弹幕', '准备播放']
export const LoadingDanmuTimeLine = () => {
  const loadingProgress = useAtomValue(loadingDanmuProgressAtom)
  return (
    <ul className="timeline flex h-full items-center justify-center ">
      {itemsTitle.map((item, index) => (
        <TimelineItem
          key={item}
          start={index === 0}
          end={index === itemsTitle.length - 1}
          index={index}
          title={item}
          progress={loadingProgress}
        />
      ))}
    </ul>
  )
}

interface TimelineProps {
  title: string
  index: number
  start: boolean
  end: boolean
  progress: LoadingStatus | null
}

const TimelineItem: FC<TimelineProps> = (props) => {
  const { title, index, start, end, progress } = props
  const isHighLight = index <= (progress || 0)
  return (
    <li>
      {!start && <hr className={cn(isHighLight && 'bg-primary')} />}
      <div className="timeline-middle">
        <CompleteIcon isHighLight={isHighLight} />
      </div>
      <div
        className={cn('timeline-box select-none', index % 2 ? 'timeline-end' : 'timeline-start')}
      >
        {title}
      </div>
      {!end && <hr className={cn(isHighLight && 'bg-primary')} />}
    </li>
  )
}
