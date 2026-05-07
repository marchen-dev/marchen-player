/**
 * 加载进度 Timeline（水平 stepper）
 *
 * 从 service state 读取当前步骤，渲染对应的视觉状态。
 * 纯 Tailwind 实现，不依赖外部 CSS 组件库。
 */

import type { LoadingState, StepName } from '@marchen/player-core'
import type { FC } from 'react'
import { VISIBLE_STEPS } from '@marchen/player-core'
import { cn } from '@renderer/lib/utils'
import { usePlayerLoadingState } from '@renderer/services/player-loading/hooks'

const stepLabels: Record<(typeof VISIBLE_STEPS)[number], string> = {
  importing: '视频导入',
  hashing: '计算哈希',
  matching: '匹配动漫',
  loading_danmaku: '获取弹幕',
  ready: '准备播放',
}

export const LoadingDanmuTimeLine = () => {
  const state = usePlayerLoadingState()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <div className="flex items-center">
        {VISIBLE_STEPS.map((stepName, index) => (
          <StepItem
            key={stepName}
            title={stepLabels[stepName]}
            stepName={stepName}
            index={index}
            isLast={index === VISIBLE_STEPS.length - 1}
            currentStep={state.step}
          />
        ))}
      </div>
      <StepDescription state={state} />
    </div>
  )
}

interface StepItemProps {
  title: string
  stepName: string
  index: number
  isLast: boolean
  currentStep: StepName
}

const StepItem: FC<StepItemProps> = ({ title, index, isLast, currentStep }) => {
  const currentIndex = VISIBLE_STEPS.indexOf(currentStep as any)
  const isCompleted = currentIndex > index
  const isActive = currentIndex === index

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
            <i className="icon-[mingcute--check-line] text-xs" />
          ) : isActive ? (
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

function getStepDescription(state: LoadingState): string {
  switch (state.step) {
    case 'importing':
      return '正在导入视频...'
    case 'hashing':
    case 'matching':
      return 'video' in state && state.video ? (('name' in state.video && state.video.name) || '') : ''
    case 'loading_danmaku':
      return `${state.match.animeTitle} - ${state.match.episodeTitle}`
    case 'ready':
      return `${state.match.animeTitle} - ${state.match.episodeTitle} · ${state.mergedComments.length} 条弹幕`
    case 'error':
      return state.error.message
    default:
      return ''
  }
}

const StepDescription: FC<{ state: LoadingState }> = ({ state }) => {
  const text = getStepDescription(state)
  if (!text) return null

  return (
    <p className={cn(
      'max-w-md truncate text-center text-sm animate-in fade-in',
      state.step === 'error' ? 'text-destructive' : 'text-muted-foreground',
    )}>
      {text}
    </p>
  )
}
