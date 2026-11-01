import type { PointerPoint } from './controller-visibility-math'
import { useCallback, useEffect, useRef, useState } from 'react'
import { isIntentionalPointerMove } from './controller-visibility-math'

// 1.5s 加 200ms 淡出约 1.7s 消失。悬停在控制栏上、拖动、键盘焦点等会锁定显示，
// 持续移动也会不断重新计时，所以较短的延迟只作用于"鼠标停在画面上不动"的情况。
const HIDE_DELAY = 1_500

interface ControllerVisibilityOptions {
  playing: boolean
  locked: boolean
}

/**
 * 控制器只在播放且没有交互锁时自动隐藏。
 * 使用递增版本而不是保存事件对象，让鼠标、键盘和触摸统一刷新隐藏计时。
 */
export const useControllerVisibility = ({ playing, locked }: ControllerVisibilityOptions) => {
  const [visible, setVisible] = useState(true)
  const [activityVersion, setActivityVersion] = useState(0)
  const visibleRef = useRef(true)
  // 上次被认定为有效活动时的指针位置，用于过滤原地抖动
  const pointerAnchorRef = useRef<PointerPoint | null>(null)

  const markActivity = useCallback(() => {
    visibleRef.current = true
    setVisible(true)
    setActivityVersion((version) => version + 1)
  }, [])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
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
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerdown', handlePointerDown, { capture: true })
      window.removeEventListener('keydown', handleKeyboardActivity)
    }
  }, [markActivity])

  useEffect(() => {
    if (!playing || locked) {
      visibleRef.current = true
      setVisible(true)
      return
    }

    const timer = window.setTimeout(() => {
      visibleRef.current = false
      setVisible(false)
    }, HIDE_DELAY)
    return () => window.clearTimeout(timer)
  }, [activityVersion, locked, playing])

  return { visible, markActivity }
}
