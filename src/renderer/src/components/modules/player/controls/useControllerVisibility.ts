import type { PointerPoint } from './controller-visibility-math'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  isIntentionalPointerMove,
  isPointerInsideWindow,
  resolveControllerVisibilityMode,
} from './controller-visibility-math'

// 1.5s 加 200ms 淡出约 1.7s 消失。悬停在控制栏上、拖动、键盘焦点等会锁定显示，
// 持续移动也会不断重新计时，所以较短的延迟只作用于"鼠标停在画面上不动"的情况。
const HIDE_DELAY = 1_500

interface ControllerVisibilityOptions {
  playing: boolean
  locked: boolean
  keepVisibleOutsideWindow: boolean
}

/**
 * 窗内播放时倒计时隐藏；离窗时无需等待，暂停也适用，交互保护除外。
 * 使用递增版本而不是保存事件对象，让鼠标、键盘和触摸统一刷新隐藏计时。
 */
export const useControllerVisibility = ({
  playing,
  locked,
  keepVisibleOutsideWindow,
}: ControllerVisibilityOptions) => {
  const [visible, setVisible] = useState(true)
  const [activityVersion, setActivityVersion] = useState(0)
  const visibleRef = useRef(true)
  const [pointerInside, setPointerInside] = useState(true)
  const pointerInsideRef = useRef(true)
  // 上次被认定为有效活动时的指针位置，用于过滤原地抖动
  const pointerAnchorRef = useRef<PointerPoint | null>(null)

  const markActivity = useCallback(() => {
    if (!pointerInsideRef.current && !keepVisibleOutsideWindow) return
    visibleRef.current = true
    setVisible(true)
    setActivityVersion((version) => version + 1)
  }, [keepVisibleOutsideWindow])

  useEffect(() => {
    const updatePointerInside = (inside: boolean) => {
      pointerInsideRef.current = inside
      setPointerInside(inside)
      if (!inside) pointerAnchorRef.current = null
    }
    const syncPointerPosition = (event: PointerEvent) => {
      const inside = isPointerInsideWindow(
        { x: event.clientX, y: event.clientY },
        window.innerWidth,
        window.innerHeight,
      )
      updatePointerInside(inside)
      return inside
    }
    const handlePointerEnter = () => {
      // 原生拖动区或红绿灯显隐会改变命中区域；重复 enter 不能唤起控制栏。
      if (pointerInsideRef.current) return
      updatePointerInside(true)
      pointerAnchorRef.current = null
      markActivity()
    }
    const handlePointerLeave = (event: PointerEvent) => {
      // 进入 Electron 原生拖动区并不等于离开窗口；否则显隐切换会形成反馈循环。
      if (
        isPointerInsideWindow(
          { x: event.clientX, y: event.clientY },
          window.innerWidth,
          window.innerHeight,
        )
      )
        return
      updatePointerInside(false)
    }
    const handlePointerMove = (event: PointerEvent) => {
      // 指针捕获期间不会发出窗口边缘的 leave，用坐标补足拖出窗口的情况。
      if (!syncPointerPosition(event)) return
      const point = { x: event.clientX, y: event.clientY }
      // 原地抖动既不重新计时也不唤起控制栏，否则手搭在鼠标上时控制栏永远不会消失。
      if (!isIntentionalPointerMove(pointerAnchorRef.current, point)) return
      pointerAnchorRef.current = point
      markActivity()
    }
    const handlePointerDown = (event: PointerEvent) => {
      pointerAnchorRef.current = { x: event.clientX, y: event.clientY }
      if (event.pointerType === 'touch' && !visibleRef.current) {
        // 触屏没有 hover：控制栏隐藏时，第一次落指只负责唤起，避免误触底层操作。
        event.preventDefault()
        event.stopPropagation()
      }
      markActivity()
    }

    const handleKeyboardActivity = (event: KeyboardEvent) => {
      // 左右方向键是快进 / 快退快捷键：隐藏时不唤起控制栏，进度反馈交给迷你进度条，避免遮挡画面。
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') return
      markActivity()
    }
    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('pointerdown', handlePointerDown, { capture: true })
    window.addEventListener('keydown', handleKeyboardActivity)
    // 只监听文档根节点的进入/离开，子控件之间移动不算离窗。
    const root = document.documentElement
    root.addEventListener('pointerenter', handlePointerEnter)
    root.addEventListener('pointerleave', handlePointerLeave)
    // 松开捕获拖动时先更新边界，随后解除交互锁即可在窗外隐藏。
    window.addEventListener('pointerup', syncPointerPosition, { capture: true })
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerdown', handlePointerDown, { capture: true })
      window.removeEventListener('keydown', handleKeyboardActivity)
      root.removeEventListener('pointerenter', handlePointerEnter)
      root.removeEventListener('pointerleave', handlePointerLeave)
      window.removeEventListener('pointerup', syncPointerPosition, { capture: true })
    }
  }, [markActivity])

  useEffect(() => {
    const mode = resolveControllerVisibilityMode({
      pointerInside,
      keepVisibleOutsideWindow,
      playing,
      locked,
    })
    if (mode !== 'auto') {
      visibleRef.current = mode === 'visible'
      setVisible(mode === 'visible')
      return
    }

    const timer = window.setTimeout(() => {
      visibleRef.current = false
      setVisible(false)
    }, HIDE_DELAY)
    return () => window.clearTimeout(timer)
  }, [activityVersion, locked, playing, pointerInside, keepVisibleOutsideWindow])

  return { visible, markActivity }
}
