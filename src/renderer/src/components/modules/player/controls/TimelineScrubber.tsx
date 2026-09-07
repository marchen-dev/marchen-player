import type { KeyboardEvent, PointerEvent } from 'react'
import { cn } from '@renderer/lib/utils'
import { useEffect, useRef, useState } from 'react'
import { timelineTimeFromPointer } from './timeline-scrubber-math'
import { formatTime } from './utils'

export interface TimelineScrubberProps {
  currentTime: number
  duration: number
  buffered: ReadonlyArray<readonly [number, number]>
  onSeek: (time: number) => void
  onPreview?: (time: number, signal: AbortSignal) => Promise<string>
  onSeekingChange?: (seeking: boolean) => void
}

export const TimelineScrubber = ({
  currentTime,
  duration,
  buffered,
  onSeek,
  onPreview,
  onSeekingChange,
}: TimelineScrubberProps) => {
  const activePointerRef = useRef<number | null>(null)
  const releasePointerListenersRef = useRef<(() => void) | null>(null)
  useEffect(() => () => releasePointerListenersRef.current?.(), [])
  const [dragTime, setDragTime] = useState<number | null>(null)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string>()
  const disabled = !Number.isFinite(duration) || duration <= 0
  const visibleTime = dragTime ?? currentTime
  const progress = disabled ? 0 : clamp(visibleTime / duration, 0, 1)
  const previewTime = dragTime ?? hoverTime
  // 缩略图按秒复用，鼠标微动不反复销毁正在解码的请求；拖动只更新时间提示。
  const frameTime = dragTime === null && hoverTime !== null ? Math.floor(hoverTime) : null
  const previewProgress = disabled || previewTime === null ? 0 : clamp(previewTime / duration, 0, 1)

  useEffect(() => {
    setPreviewUrl(undefined)
    if (frameTime === null || !onPreview) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void onPreview(frameTime, controller.signal)
        .then((url) => {
          if (!controller.signal.aborted) setPreviewUrl(url)
        })
        .catch(() => {})
    }, 100)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [onPreview, frameTime])

  const timeFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return timelineTimeFromPointer(event.clientX, rect.left, rect.width, duration)
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0 || activePointerRef.current !== null) return
    event.preventDefault()
    const element = event.currentTarget
    const pointerId = event.pointerId
    activePointerRef.current = pointerId
    element.setPointerCapture(pointerId)
    setHoverTime(null)
    setDragTime(timeFromPointer(event))
    onSeekingChange?.(true)

    const targetTime = (clientX: number) => {
      const rect = element.getBoundingClientRect()
      return timelineTimeFromPointer(clientX, rect.left, rect.width, duration)
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', finish, true)
      window.removeEventListener('pointercancel', cancel, true)
      window.removeEventListener('blur', blur)
      releasePointerListenersRef.current = null
    }
    const end = () => {
      activePointerRef.current = null
      cleanup()
      if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId)
      setDragTime(null)
      setHoverTime(null)
      onSeekingChange?.(false)
    }
    const move = (pointer: globalThis.PointerEvent) => {
      if (pointer.pointerId === pointerId) setDragTime(targetTime(pointer.clientX))
    }
    const finish = (pointer: globalThis.PointerEvent) => {
      if (pointer.pointerId !== pointerId) return
      const target = targetTime(pointer.clientX)
      end()
      onSeek(target)
    }
    const cancel = (pointer: globalThis.PointerEvent) => {
      if (pointer.pointerId === pointerId) end()
    }
    const blur = () => end()
    // Capture 是事件路由机制，不是用户取消意图。中途失去 capture 仍在窗口松开时提交一次；
    // 只有 pointercancel、窗口失焦或组件卸载才取消，避免滑块跳回但定位命令丢失。
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', finish, true)
    window.addEventListener('pointercancel', cancel, true)
    window.addEventListener('blur', blur)
    releasePointerListenersRef.current = cleanup
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointerRef.current !== null) return
    if (event.pointerType === 'mouse') setHoverTime(timeFromPointer(event))
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
      onPointerLeave={handlePointerLeave}
      onKeyDown={handleKeyDown}
    >
      <div
        data-timeline-track
        data-telemetry-replay-block
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
          className="pointer-events-none absolute bottom-full mb-1 w-max -translate-x-1/2 rounded-md bg-black px-2 py-1 text-xs text-white tabular-nums"
          style={{ left: `${previewProgress * 100}%` }}
        >
          {previewUrl && (
            <img
              src={previewUrl}
              alt=""
              data-player-preview
              data-telemetry-replay-block
              className="mb-1 h-auto max-h-36 w-60 rounded object-contain"
            />
          )}
          <span className="block text-center">{formatTime(previewTime)}</span>
        </output>
      )}
    </div>
  )
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum)
