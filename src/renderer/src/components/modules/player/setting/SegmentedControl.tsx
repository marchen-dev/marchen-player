import type { KeyboardEvent, ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'
import { useRef } from 'react'

import { panelChoiceClassName } from './panel-choice'

export interface SegmentedOption<T extends string | number> {
  value: T
  label: ReactNode
}

interface SegmentedControlProps<T extends string | number> {
  /** 读屏名称，通常就是所在分组的标题 */
  label: string
  value: T
  options: ReadonlyArray<SegmentedOption<T>>
  onValueChange: (value: T) => void
  /** 布局由调用方决定，例如 `grid-cols-5` */
  className?: string
}

/**
 * 播放侧栏的单选分段按钮。
 *
 * 语义是 radiogroup：Tab 只停在选中项，方向键在选项间移动并直接选中（roving tabindex）。
 * 外观沿用侧栏原有的选项按钮。
 */
export const SegmentedControl = <T extends string | number>({
  label,
  value,
  options,
  onValueChange,
  className,
}: SegmentedControlProps<T>) => {
  const itemsRef = useRef<Array<HTMLButtonElement | null>>([])
  const selectedIndex = options.findIndex((option) => option.value === value)
  // 当前值不在选项里时，让第一项可以被 Tab 聚焦
  const focusableIndex = selectedIndex === -1 ? 0 : selectedIndex

  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % options.length
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = (index - 1 + options.length) % options.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = options.length - 1
    if (next === null) return
    event.preventDefault()
    const option = options[next]
    if (!option) return
    onValueChange(option.value)
    itemsRef.current[next]?.focus()
  }

  return (
    <div role="radiogroup" aria-label={label} className={cn('grid gap-2', className)}>
      {options.map((option, index) => {
        const checked = index === selectedIndex
        return (
          <button
            key={String(option.value)}
            ref={(node) => {
              itemsRef.current[index] = node
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={index === focusableIndex ? 0 : -1}
            className={panelChoiceClassName(checked)}
            onClick={() => onValueChange(option.value)}
            onKeyDown={(event) => move(event, index)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
