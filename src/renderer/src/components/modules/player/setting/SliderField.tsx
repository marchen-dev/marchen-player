import type { ReactNode } from 'react'
import { Slider } from '@renderer/components/ui/slider'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/Tooltip'
import { useEventCallback } from '@renderer/hooks/use-event-callback'
import { cn } from '@renderer/lib/utils'
import { usePlayerPortalContainer } from '@renderer/services/player-runtime'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface SliderFieldProps {
  title: string
  value: number
  defaultValue: number
  min: number
  max: number
  step: number
  /** 当前值的显示文字，标题行与读屏共用 */
  formatValue: (value: number) => string
  /** 写入设置。拖动中每帧最多调用一次，松手时再以最终值调用一次 */
  onValueChange: (value: number) => void
  disabled?: boolean
  /** 标题下方的补充说明（例如禁用原因） */
  description?: ReactNode
}

/**
 * 播放侧栏的滑块设置行：标题与当前值同一行，滑块占满下方整行。
 *
 * 设置写入会同步序列化整份播放设置到 localStorage（含最多 500 条屏蔽规则），
 * 所以拖动时用本地草稿值驱动显示，并按动画帧合并写入：画面跟手，又不会一次拖动写上百次。
 */
export const SliderField = ({
  title,
  value,
  defaultValue,
  min,
  max,
  step,
  formatValue,
  onValueChange,
  disabled,
  description,
}: SliderFieldProps) => {
  const { t } = useTranslation('player')
  const portalContainer = usePlayerPortalContainer()
  const [draft, setDraft] = useState<number | null>(null)
  const frameRef = useRef<number | null>(null)
  const pendingRef = useRef<number | null>(null)
  const commit = useEventCallback(onValueChange)

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    },
    [],
  )

  const shown = draft ?? value
  const shownText = formatValue(shown)

  const scheduleCommit = (next: number) => {
    pendingRef.current = next
    if (frameRef.current !== null) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      if (pendingRef.current !== null) commit(pendingRef.current)
    })
  }

  const commitNow = (next: number) => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    pendingRef.current = null
    setDraft(null)
    commit(next)
  }

  const resetLabel = t('settingsPanel.resetToDefaultLabel', { name: title })

  return (
    <div className="space-y-2">
      <div className="flex min-h-6 items-center justify-between gap-3 text-sm">
        <div className="min-w-0">
          <span>{title}</span>
          {description}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* 等宽数字：拖动时数值宽度不变，标题行不左右跳 */}
          <span className="text-[var(--player-settings-muted)] tabular-nums">{shownText}</span>
          {/* 重置按钮只在非默认值时出现；固定占位，出现与消失时数值不移动 */}
          <span className="flex size-6 items-center justify-center">
            {shown !== defaultValue && !disabled && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={resetLabel}
                    className={cn(
                      'flex size-6 items-center justify-center rounded-md text-[var(--player-settings-muted)] transition-colors',
                      'hover:bg-white/10 hover:text-[var(--player-settings-fg)]',
                      'focus-visible:ring-2 focus-visible:ring-[var(--player-settings-focus)] focus-visible:outline-none',
                    )}
                    onClick={() => commitNow(defaultValue)}
                  >
                    <i className="icon-[mingcute--refresh-2-line] text-sm" aria-hidden />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  container={portalContainer}
                  side="top"
                  sideOffset={6}
                  className="bg-player-popover player-glass border border-white/11 text-white shadow-lg"
                >
                  {t('settingsPanel.resetToDefault')}
                </TooltipContent>
              </Tooltip>
            )}
          </span>
        </div>
      </div>
      <Slider
        playerMaterial
        label={title}
        valueText={shownText}
        min={min}
        max={max}
        step={step}
        marks={[defaultValue]}
        disabled={disabled}
        value={[shown]}
        onValueChange={([next]) => {
          if (next === undefined) return
          setDraft(next)
          scheduleCommit(next)
        }}
        onValueCommit={([next]) => {
          if (next !== undefined) commitNow(next)
        }}
      />
    </div>
  )
}
