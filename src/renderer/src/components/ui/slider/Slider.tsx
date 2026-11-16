import { cn } from '@renderer/lib/utils'
import { Slider as SliderPrimitive } from 'radix-ui'
import * as React from 'react'

/** 滑块直径（px）。Radix 按实际尺寸把滑块限制在轨道内，刻度位置要用同一个值换算 */
const THUMB_SIZE = 12

type SliderProps = React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
  ref?: React.RefObject<React.ElementRef<typeof SliderPrimitive.Root> | null>
  /** 在轨道上画细刻度的取值，常用来标出默认值 */
  marks?: readonly number[]
  /** 浮在视频上的播放器毛玻璃材质：白色填充，轨道与控制条音量滑块同源 */
  playerMaterial?: boolean
  /** 读屏软件读到的名称；Radix 把 slider 角色放在滑块上，名称也要给滑块 */
  label?: string
  /** 读屏软件读到的当前值文字，例如「120%」「适中」 */
  valueText?: string
}

/**
 * 细轨道、实心小滑块，外观以控制条音量滑块为准。
 * 悬停或拖动时轨道加粗、滑块放大；滑块放大用 transform，不改变 Radix 测得的尺寸，
 * 否则滑块在两端的限位会跟着跳。
 */
const Slider = ({
  ref,
  className,
  marks,
  playerMaterial,
  label,
  valueText,
  min = 0,
  max = 100,
  ...props
}: SliderProps) => (
  <SliderPrimitive.Root
    ref={ref}
    min={min}
    max={max}
    className={cn(
      'group/slider relative flex h-5 w-full touch-none items-center select-none',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
      className,
    )}
    {...props}
  >
    <SliderPrimitive.Track
      className={cn(
        'relative h-1 w-full grow overflow-hidden rounded-full transition-[height] duration-120',
        'group-hover/slider:h-1.5 group-has-[:active]/slider:h-1.5',
        playerMaterial ? 'bg-[var(--player-track)]' : 'bg-muted',
      )}
    >
      <SliderPrimitive.Range
        className={cn('absolute h-full', playerMaterial ? 'bg-white' : 'bg-foreground')}
      />
    </SliderPrimitive.Track>
    {marks?.map((mark) => {
      const ratio = max === min ? 0 : (mark - min) / (max - min)
      return (
        <span
          key={mark}
          aria-hidden
          className={cn(
            'pointer-events-none absolute top-1/2 h-2 w-px -translate-x-1/2 -translate-y-1/2 rounded-full',
            playerMaterial ? 'bg-white/45' : 'bg-muted-foreground/60',
          )}
          // 与 Radix 的滑块限位一致：两端各让出半个滑块
          style={{ left: `calc(${ratio * 100}% + ${(THUMB_SIZE / 2) * (1 - 2 * ratio)}px)` }}
        />
      )
    })}
    <SliderPrimitive.Thumb
      aria-label={label}
      aria-valuetext={valueText}
      style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
      className={cn(
        'block rounded-full shadow-[0_1px_3px_rgb(0_0_0/35%)] transition-transform duration-120 outline-none',
        'group-hover/slider:scale-[1.17] active:scale-[1.17]',
        'focus-visible:ring-2 focus-visible:ring-offset-0',
        playerMaterial
          ? 'bg-white focus-visible:ring-[var(--player-settings-focus)]'
          : 'bg-foreground focus-visible:ring-ring',
      )}
    />
  </SliderPrimitive.Root>
)
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
export type { SliderProps }
