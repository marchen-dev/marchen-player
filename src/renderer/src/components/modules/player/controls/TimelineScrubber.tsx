import type { KeyboardEvent, PointerEvent } from 'react'
import { cn } from '@renderer/lib/utils'
import { useState } from 'react'
import { timelineTimeFromPointer } from './timeline-scrubber-math'
import { formatTime } from './utils'

export interface TimelineScrubberProps {
  currentTime: number
  duration: number
  buffered: ReadonlyArray<readonly [number, number]>
  onSeek: (time: number) => void
  onSeekingChange?: (seeking: boolean) => void
}

export const TimelineScrubber = ({
  currentTime,
  duration,
  buffered,
  onSeek,
  onSeekingChange,
}: TimelineScrubberProps) => {
  const [dragTime, setDragTime] = useState<number | null>(null)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const disabled = !Number.isFinite(duration) || duration <= 0
  const visibleTime = dragTime ?? currentTime
  const progress = disabled ? 0 : clamp(visibleTime / duration, 0, 1)
  const previewTime = dragTime ?? hoverTime
  const previewProgress =
    disabled || previewTime === null ? 0 : clamp(previewTime / duration, 0, 1)

  const timeFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return timelineTimeFromPointer(event.clientX, rect.left, rect.width, duration)
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setHoverTime(null)
    setDragTime(timeFromPointer(event))
    onSeekingChange?.(true)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      setDragTime(timeFromPointer(event))
      return
    }
    if (event.pointerType === 'mouse') setHoverTime(timeFromPointer(event))
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const target = timeFromPointer(event)
    event.currentTarget.releasePointerCapture(event.pointerId)
    setDragTime(null)
    if (event.pointerType === 'mouse') setHoverTime(target)
    onSeekingChange?.(false)
    onSeek(target)
  }

  const handlePointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDragTime(null)
    setHoverTime(null)
    onSeekingChange?.(false)
  }

  const handlePointerLeave = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) setHoverTime(null)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    const step = event.shiftKey ? 30 : 5
    let target: number | null = null
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') target = currentTime - step
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') target = currentTime + step
    if (event.key === 'Home') target = 0
    if (event.key === 'End') target = duration
    if (target === null) return
    event.preventDefault()
    onSeek(clamp(target, 0, duration))
  }

  return (
    <div
      data-no-controller-drag
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="播放进度"
      aria-disabled={disabled}
      aria-valuemin={0}
      aria-valuemax={Math.max(duration, 0)}
      aria-valuenow={Math.round(visibleTime)}
      aria-valuetext={`${formatTime(visibleTime)} / ${formatTime(duration)}`}
      className={cn(
        'no-drag-region group relative flex h-8 min-w-0 flex-1 touch-none items-center outline-none',
        'focus-visible:[&_[data-timeline-track]]:ring-2 focus-visible:[&_[data-timeline-track]]:ring-[var(--player-focus)]',
        disabled && 'pointer-events-none opacity-40',
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerLeave}
      onKeyDown={handleKeyDown}
    >
      <div
        data-timeline-track
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--player-track)] transition-[height] group-hover:h-2"
      >
        {buffered.map(([start, end]) => {
          const left = disabled ? 0 : clamp(start / duration, 0, 1) * 100
          const width = disabled ? 0 : clamp(end / duration, 0, 1) * 100 - left
          return (
            <span
              key={`${start}-${end}`}
              className="absolute inset-y-0 bg-[var(--player-buffered)]"
              style={{ left: `${left}%`, width: `${width}%` }}
            />
          )
        })}
        <span
          className="absolute inset-y-0 left-0 bg-[var(--player-progress)]"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <span
        className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow"
        style={{ left: `${progress * 100}%` }}
      />

      {previewTime !== null && (
        <output
          className="pointer-events-none absolute bottom-full mb-1 -translate-x-1/2 rounded-md bg-black/85 px-2 py-1 text-xs text-white tabular-nums"
          style={{ left: `${previewProgress * 100}%` }}
        >
          {formatTime(previewTime)}
        </output>
      )}
    </div>
  )
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum)
