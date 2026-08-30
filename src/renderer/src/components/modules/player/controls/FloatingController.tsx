import type { PanInfo } from 'framer-motion'
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { usePlayerSettings } from '@renderer/atoms/settings/player'
import { cn } from '@renderer/lib/utils'
import { m, useDragControls, useMotionValue } from 'framer-motion'
import { createContext, use, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { canStartControllerDrag } from './controller-drag'
import { resolveControllerPosition, withControllerPosition } from './controller-position'

export interface FloatingControllerProps {
  left?: ReactNode
  transport?: ReactNode
  tools?: ReactNode
  timeline?: ReactNode
  className?: string
  visible?: boolean
  onDraggingChange?: (dragging: boolean) => void
  onRectChange?: (rect: DOMRect | null) => void
}

interface SafeBounds {
  left: number
  right: number
  top: number
  bottom: number
}

export type ControllerPositionPreset = 'top' | 'default' | 'bottom' | 'reset'

interface ControllerPositionContextValue {
  moveToPreset: (preset: ControllerPositionPreset) => void
}

const ControllerPositionContext = createContext<ControllerPositionContextValue | null>(null)

export const useControllerPosition = () => {
  const context = use(ControllerPositionContext)
  if (!context) throw new Error('useControllerPosition 必须在 FloatingController 中使用')
  return context
}

/** 桌面双行悬浮控制器，空白区域可拖动，交互控件保持原生点击行为。 */
export const FloatingController = ({
  left,
  transport,
  tools,
  timeline,
  className,
  visible = true,
  onDraggingChange,
  onRectChange,
}: FloatingControllerProps) => {
  const controllerRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLElement | null>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const dragControls = useDragControls()
  const [settings, setSettings] = usePlayerSettings()
  const [bounds, setBounds] = useState<SafeBounds>({ left: 16, right: 16, top: 56, bottom: 16 })
  const [positioned, setPositioned] = useState(false)

  const reportRect = useCallback(() => {
    const rect = controllerRef.current?.getBoundingClientRect()
    onRectChange?.(visible && rect && rect.width > 0 && rect.height > 0 ? rect : null)
  }, [onRectChange, visible])

  const measure = useCallback(() => {
    const controller = controllerRef.current
    const root = rootRef.current
    if (!controller || !root || controller.offsetWidth === 0) return

    const nextBounds = {
      left: 16,
      right: Math.max(16, root.clientWidth - controller.offsetWidth - 16),
      top: 56,
      bottom: Math.max(56, root.clientHeight - controller.offsetHeight - 24),
    }
    const saved = resolveControllerPosition(settings.controllerPosition)
    setBounds(nextBounds)
    x.set(project(saved.xRatio, nextBounds.left, nextBounds.right))
    y.set(project(saved.yRatio, nextBounds.top, nextBounds.bottom))
    setPositioned(true)
    requestAnimationFrame(reportRect)
  }, [reportRect, settings.controllerPosition, x, y])

  useLayoutEffect(() => {
    rootRef.current = controllerRef.current?.closest<HTMLElement>('[data-player-root]') ?? null
    measure()
    const observer = new ResizeObserver(measure)
    if (rootRef.current) observer.observe(rootRef.current)
    if (controllerRef.current) observer.observe(controllerRef.current)
    return () => observer.disconnect()
  }, [measure])

  useLayoutEffect(() => {
    reportRect()
  }, [reportRect])

  const startDrag = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    onDraggingChange?.(true)
    dragControls.start(event)
  }

  const startDragFromSurface = (event: PointerEvent<HTMLDivElement>) => {
    if (!canStartControllerDrag(event.target)) return
    startDrag(event)
  }

  const persistPosition = (
    _event: MouseEvent | TouchEvent | globalThis.PointerEvent,
    _info: PanInfo,
  ) => {
    persistRatio(
      ratio(x.get(), bounds.left, bounds.right),
      ratio(y.get(), bounds.top, bounds.bottom),
    )
    onDraggingChange?.(false)
    reportRect()
  }

  const persistRatio = useCallback(
    (xRatio: number, yRatio: number) => {
      setSettings((current) => withControllerPosition(current, { xRatio, yRatio }))
    },
    [setSettings],
  )

  const moveToRatio = useCallback(
    (xRatio: number, yRatio: number) => {
      const nextX = clamp(xRatio, 0, 1)
      const nextY = clamp(yRatio, 0, 1)
      x.set(project(nextX, bounds.left, bounds.right))
      y.set(project(nextY, bounds.top, bounds.bottom))
      persistRatio(nextX, nextY)
      requestAnimationFrame(reportRect)
    },
    [bounds, persistRatio, reportRect, x, y],
  )

  const moveToPreset = useCallback(
    (preset: ControllerPositionPreset) => {
      if (preset === 'top') moveToRatio(0.5, 0.18)
      if (preset === 'default' || preset === 'reset') moveToRatio(0.5, 0.72)
      if (preset === 'bottom') moveToRatio(0.5, 1)
    },
    [moveToRatio],
  )

  const positionContext = useMemo(() => ({ moveToPreset }), [moveToPreset])

  const handleKeyboardMove = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Home') {
      event.preventDefault()
      moveToPreset('reset')
      return
    }

    const step = event.shiftKey ? 32 : 8
    let nextX = x.get()
    let nextY = y.get()
    if (event.key === 'ArrowLeft') nextX -= step
    else if (event.key === 'ArrowRight') nextX += step
    else if (event.key === 'ArrowUp') nextY -= step
    else if (event.key === 'ArrowDown') nextY += step
    else return

    event.preventDefault()
    nextX = clamp(nextX, bounds.left, bounds.right)
    nextY = clamp(nextY, bounds.top, bounds.bottom)
    x.set(nextX)
    y.set(nextY)
    persistRatio(ratio(nextX, bounds.left, bounds.right), ratio(nextY, bounds.top, bounds.bottom))
  }

  return (
    <ControllerPositionContext value={positionContext}>
      <m.div
        ref={controllerRef}
        data-player-floating-controller
        role="group"
        aria-label="播放控制"
        drag
        dragListener={false}
        dragControls={dragControls}
        dragElastic={0}
        dragMomentum={false}
        dragConstraints={bounds}
        onDrag={reportRect}
        onDragEnd={persistPosition}
        onPointerDown={startDragFromSurface}
        style={{ x, y }}
        className={cn(
          'absolute top-0 left-0 z-40 w-[min(520px,calc(100%-32px))]',
          'cursor-default rounded-2xl border border-[var(--player-border)] bg-[var(--player-surface)] px-3 py-2',
          'text-[var(--player-fg)] shadow-[var(--player-shadow)] backdrop-blur-2xl backdrop-saturate-150',
          'transition-opacity duration-200 motion-reduce:transition-none',
          visible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
          !positioned && 'opacity-0',
          className,
        )}
      >
        <button
          type="button"
          aria-label="拖动播放控制器"
          aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Shift+ArrowLeft Shift+ArrowRight Shift+ArrowUp Shift+ArrowDown Home"
          className="absolute top-1 left-1/2 flex h-3 w-24 -translate-x-1/2 cursor-default items-center justify-center rounded-full opacity-0 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--player-focus)] focus-visible:outline-none"
          onPointerDown={startDrag}
          onKeyDown={handleKeyboardMove}
        >
          <span className="h-1 w-9 rounded-full bg-white/20" aria-hidden />
        </button>
        <div className="grid min-h-9 grid-cols-[1fr_auto_1fr] items-center gap-1.5">
          <div className="flex min-w-0 items-center justify-start gap-1">{left}</div>
          <div className="flex items-center justify-center gap-1.5">{transport}</div>
          <div className="flex min-w-0 items-center justify-end gap-1">{tools}</div>
        </div>
        <div className="flex min-h-6 items-center gap-2">{timeline}</div>
      </m.div>
    </ControllerPositionContext>
  )
}

const project = (value: number, minimum: number, maximum: number) =>
  minimum + clamp(value, 0, 1) * Math.max(0, maximum - minimum)

const ratio = (value: number, minimum: number, maximum: number) => {
  const range = maximum - minimum
  return range <= 0 ? 0.5 : clamp((value - minimum) / range, 0, 1)
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum)
