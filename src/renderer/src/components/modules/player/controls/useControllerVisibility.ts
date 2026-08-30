import { useCallback, useEffect, useRef, useState } from 'react'

const HIDE_DELAY = 2_800

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

  const markActivity = useCallback(() => {
    visibleRef.current = true
    setVisible(true)
    setActivityVersion((version) => version + 1)
  }, [])

  useEffect(() => {
    const handlePointerMove = () => markActivity()
    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch' && !visibleRef.current) {
        // 触屏没有 hover：控制栏隐藏时，第一次落指只负责唤起，避免误触底层操作。
        event.preventDefault()
        event.stopPropagation()
      }
      markActivity()
    }

    const handleKeyboardActivity = () => markActivity()
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
