import type { LoadingStatus } from '@renderer/atoms/player'
import type { FC } from 'react'
import { loadingDanmuProgressAtom } from '@renderer/atoms/player'
import { cn } from '@renderer/lib/utils'
import { useAtomValue } from 'jotai'

const steps = ['视频导入', '计算哈希', '匹配动漫', '获取弹幕', '准备播放']

export const LoadingDanmuTimeLine = () => {
  const loadingProgress = useAtomValue(loadingDanmuProgressAtom)
  return (
    <div className="flex h-full items-center justify-center">
      {steps.map((title, index) => (
        <StepItem
          key={title}
          title={title}
          index={index}
          isLast={index === steps.length - 1}
          progress={loadingProgress}
        />
      ))}
    </div>
  )
}

interface StepItemProps {
  title: string
  index: number
  isLast: boolean
  progress: LoadingStatus | null
}

const StepItem: FC<StepItemProps> = ({ title, index, isLast, progress }) => {
  const currentStep = progress ?? -1
  const isCompleted = index < currentStep
  const isActive = index === currentStep

  return (
    <>
      <div className="flex flex-col items-center gap-1.5">
        {/* 步骤圆圈 */}
        <div
          className={cn(
            'flex size-6 items-center justify-center rounded-full border-2 transition-colors',
            isCompleted && 'border-primary bg-primary text-primary-foreground',
            isActive && 'border-primary bg-background',
            !isCompleted && !isActive && 'border-muted-foreground/30 bg-background',
          )}
        >
          {isCompleted ? (
            // 完成状态：显示 check icon
            <i className="icon-[mingcute--check-line] text-xs" />
          ) : isActive ? (
            // 进行中：显示脉冲动画圆点
            <span className="size-2 animate-pulse rounded-full bg-primary" />
          ) : null}
        </div>
        {/* 步骤标题 */}
        <span
          className={cn(
            'text-xs select-none',
            (isCompleted || isActive) && 'text-foreground font-medium',
            !isCompleted && !isActive && 'text-muted-foreground',
          )}
        >
          {title}
        </span>
      </div>
      {/* 步骤间连接线 */}
      {!isLast && (
        <div
          className={cn(
            'mx-2 mb-5 h-0.5 w-10 rounded-full transition-colors',
            isCompleted ? 'bg-primary' : 'bg-muted-foreground/20',
          )}
        />
      )}
    </>
  )
}
