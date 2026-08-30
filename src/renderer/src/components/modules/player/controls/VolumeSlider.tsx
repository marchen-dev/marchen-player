import type { KeyboardEvent, PointerEvent } from 'react'
import { useState } from 'react'
import { volumeFromPointer } from './volume-slider-math'

export interface VolumeSliderProps {
  value: number
  onValueChange: (value: number) => void
  onDraggingChange?: (dragging: boolean) => void
  className?: string
}

/**
 * 音量使用自研指针滑块，避免原生 range 在可拖动毛玻璃面板内重绘时出现滑块闪跳。
 * 拖动期间以组件内的即时值渲染，媒体事件只负责最终同步音量。
 */
export const VolumeSlider = ({
  value,
  onValueChange,
  onDraggingChange,
  className,
}: VolumeSliderProps) => {
  const [dragValue, setDragValue] = useState<number | null>(null)
  const visibleValue = clamp(dragValue ?? value, 0, 1)

  const updateFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const next = volumeFromPointer(event.clientX, rect.left, rect.width)
    setDragValue(next)
    onValueChange(next)
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    onDraggingChange?.(true)
    updateFromPointer(event)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    updateFromPointer(event)
  }

  const finishDragging = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDragValue(null)
    onDraggingChange?.(false)
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    updateFromPointer(event)
    finishDragging(event)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = visibleValue - 0.05
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = visibleValue + 0.05
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = 1
    if (next === null) return
    event.preventDefault()
    onValueChange(clamp(next, 0, 1))
  }

  return (
    <div
      data-no-controller-drag
      role="slider"
      tabIndex={0}
      aria-label="音量"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(visibleValue * 100)}
      aria-valuetext={`${Math.round(visibleValue * 100)}%`}
      className={`no-drag-region group relative flex h-8 w-24 cursor-default touch-none items-center outline-none focus-visible:[&_[data-volume-track]]:ring-2 focus-visible:[&_[data-volume-track]]:ring-[var(--player-focus)] ${className ?? ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={finishDragging}
      onKeyDown={handleKeyDown}
    >
      <div
        data-volume-track
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--player-track)]"
      >
        <span
          className="absolute inset-y-0 left-0 bg-white"
          style={{ width: `${visibleValue * 100}%` }}
        />
      </div>
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow"
        style={{ left: `${visibleValue * 100}%` }}
      />
    </div>
  )
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum)
