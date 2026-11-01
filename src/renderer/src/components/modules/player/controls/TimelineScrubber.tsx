import type { KeyboardEvent, PointerEvent } from 'react'
import { cn } from '@renderer/lib/utils'
import { AnimatePresence, m } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { placePreviewBubble, timelineTimeFromPointer } from './timeline-scrubber-math'
import { formatTime } from './utils'

export interface TimelineScrubberProps {
  currentTime: number
  duration: number
  buffered: ReadonlyArray<readonly [number, number]>
  onSeek: (time: number) => void
  onPreview?: (time: number, signal: AbortSignal) => Promise<string>
  onSeekingChange?: (seeking: boolean) => void
}

/** 指针在进度条上的位置：时间 + 用于摆放预览框的坐标（均相对进度条左边缘，单位 px） */
interface ScrubPoint {
  time: number
  x: number
  minLeft: number
  maxRight: number
}

// 缩略图最大尺寸，与预览抽帧的 maxWidth 一致
const PREVIEW_MAX_WIDTH = 240
const PREVIEW_MAX_HEIGHT = 144
const DEFAULT_ASPECT_RATIO = 16 / 9
// 预览框 p-1 的左右内边距合计
const BUBBLE_PADDING = 8
// 拖动时只显示时间的气泡宽度估计值（含 "1:23:45"），只用于边界计算
const TIME_ONLY_BUBBLE_WIDTH = 64
// 预览框与控制栏边缘保持的间距
const BUBBLE_EDGE_GAP = 4
// 离开进度条后的宽限：擦过边缘再回来不会闪烁
const LEAVE_GRACE_MS = 80

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
  const leaveTimerRef = useRef<number | null>(null)
  useEffect(
    () => () => {
      releasePointerListenersRef.current?.()
      if (leaveTimerRef.current !== null) window.clearTimeout(leaveTimerRef.current)
    },
    [],
  )
  const [drag, setDrag] = useState<ScrubPoint | null>(null)
  const [hover, setHover] = useState<ScrubPoint | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string>()
  // 记录最近一帧的宽高比，让图片区在整个悬停过程中尺寸不变；首帧前按 16:9 占位
  const [aspectRatio, setAspectRatio] = useState(DEFAULT_ASPECT_RATIO)
  const disabled = !Number.isFinite(duration) || duration <= 0
  const dragTime = drag?.time ?? null
  const visibleTime = dragTime ?? currentTime
  const progress = disabled ? 0 : clamp(visibleTime / duration, 0, 1)
  const scrub = drag ?? hover
  // 缩略图按秒复用，鼠标微动不反复销毁正在解码的请求；拖动只更新时间提示。
  const frameTime = drag === null && hover !== null ? Math.floor(hover.time) : null

  // 视频源或旋转变化时 onPreview 会换成新函数，旧帧不再对应当前画面。
  // seeking 期间 onPreview 会暂时为 undefined，此时保留旧帧，避免预览框塌陷。
  const previewOwnerRef = useRef(onPreview)
  useEffect(() => {
    if (!onPreview || onPreview === previewOwnerRef.current) return
    previewOwnerRef.current = onPreview
    setPreviewUrl(undefined)
  }, [onPreview])

  useEffect(() => {
    // 不在这里清空旧帧：新帧到达前继续显示上一帧，预览框尺寸保持不变。
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

  const cancelLeave = () => {
    if (leaveTimerRef.current === null) return
    window.clearTimeout(leaveTimerRef.current)
    leaveTimerRef.current = null
  }

  /** 结束一次悬停：下次进入从占位开始，不闪现别处的旧帧 */
  const endHover = () => {
    cancelLeave()
    setHover(null)
    setPreviewUrl(undefined)
  }

  const scrubPointAt = (element: HTMLElement, clientX: number): ScrubPoint => {
    const rect = element.getBoundingClientRect()
    // 预览框以控制栏为边界；找不到控制栏（如移动端底栏）时退回进度条自身
    const bounds =
      element.closest<HTMLElement>('[data-player-floating-controller]')?.getBoundingClientRect() ??
      rect
    return {
      time: timelineTimeFromPointer(clientX, rect.left, rect.width, duration),
      x: clamp(clientX - rect.left, 0, rect.width),
      minLeft: bounds.left - rect.left + BUBBLE_EDGE_GAP,
      maxRight: bounds.right - rect.left - BUBBLE_EDGE_GAP,
    }
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0 || activePointerRef.current !== null) return
    event.preventDefault()
    const element = event.currentTarget
    const pointerId = event.pointerId
    activePointerRef.current = pointerId
    element.setPointerCapture(pointerId)
    cancelLeave()
    // 拖动期间不再跟随悬停，预览框收缩为只显示时间的气泡
    setHover(null)
    setDrag(scrubPointAt(element, event.clientX))
    onSeekingChange?.(true)

    const targetTime = (clientX: number) => scrubPointAt(element, clientX).time
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
      setDrag(null)
      endHover()
      onSeekingChange?.(false)
    }
    const move = (pointer: globalThis.PointerEvent) => {
      if (pointer.pointerId === pointerId) setDrag(scrubPointAt(element, pointer.clientX))
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
    if (activePointerRef.current !== null || event.pointerType !== 'mouse') return
    cancelLeave()
    setHover(scrubPointAt(event.currentTarget, event.clientX))
  }

  const handlePointerLeave = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) return
    cancelLeave()
    leaveTimerRef.current = window.setTimeout(endHover, LEAVE_GRACE_MS)
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

      <AnimatePresence>
        {scrub && (
          <PreviewBubble
            key="timeline-preview"
            point={scrub}
            dragging={drag !== null}
            // 没有抽帧能力时只显示时间；seeking 期间 onPreview 暂缺但已有旧帧时继续显示
            showFrame={Boolean(onPreview || previewUrl)}
            previewUrl={previewUrl}
            aspectRatio={aspectRatio}
            onFrameLoad={setAspectRatio}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

interface PreviewBubbleProps {
  point: ScrubPoint
  dragging: boolean
  showFrame: boolean
  previewUrl?: string
  aspectRatio: number
  onFrameLoad: (aspectRatio: number) => void
}

/**
 * 悬停预览框：缩略图 + 时间。
 * 位置紧跟指针不做缓动（跟手），只对出现 / 消失和拖动时的收缩做过渡。
 */
const PreviewBubble = ({
  point,
  dragging,
  showFrame,
  previewUrl,
  aspectRatio,
  onFrameLoad,
}: PreviewBubbleProps) => {
  const frameSize = fitPreviewFrame(aspectRatio)
  const frameVisible = showFrame && !dragging
  const bubbleWidth = frameVisible ? frameSize.width + BUBBLE_PADDING : TIME_ONLY_BUBBLE_WIDTH
  const placement = placePreviewBubble(point.x, bubbleWidth, point.minLeft, point.maxRight)

  return (
    <m.output
      className="pointer-events-none absolute bottom-full mb-2 flex w-max flex-col items-center rounded-md bg-black p-1 text-xs text-white tabular-nums"
      style={{ left: placement.center, x: '-50%' }}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.12, ease: 'easeOut' } }}
      exit={{ opacity: 0, y: 4, transition: { duration: 0.1, ease: 'easeIn' } }}
    >
      <m.div
        className="overflow-hidden rounded bg-white/10"
        // 首次出现即为拖动态（如触屏直接按下）时不播放收缩动画
        initial={false}
        animate={
          frameVisible
            ? { width: frameSize.width, height: frameSize.height, opacity: 1, marginBottom: 4 }
            : { width: 0, height: 0, opacity: 0, marginBottom: 0 }
        }
        transition={{ duration: 0.15, ease: 'easeOut' }}
      >
        {previewUrl && (
          <img
            src={previewUrl}
            alt=""
            data-player-preview
            className="size-full object-contain"
            onLoad={(event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget
              if (naturalWidth > 0 && naturalHeight > 0) onFrameLoad(naturalWidth / naturalHeight)
            }}
          />
        )}
      </m.div>
      <span className="block px-1.5 py-0.5 text-center">{formatTime(point.time)}</span>
      <span
        aria-hidden
        className="absolute top-full size-0 -translate-x-1/2 border-x-[5px] border-t-[5px] border-x-transparent border-t-black"
        style={{ left: `calc(50% + ${placement.caretOffset}px)` }}
      />
    </m.output>
  )
}

/** 按宽高比把缩略图放进 240×144 的框内，竖屏片源以高度为准 */
const fitPreviewFrame = (aspectRatio: number) => {
  const height = Math.min(PREVIEW_MAX_HEIGHT, PREVIEW_MAX_WIDTH / aspectRatio)
  return { width: Math.round(height * aspectRatio), height: Math.round(height) }
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum)
