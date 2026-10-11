import type { MouseEvent } from 'react'
import { useCallback, useEffect, useRef } from 'react'

/** 单击等待第二下的时长；略短于系统双击间隔，兼顾响应速度与双击识别 */
const SINGLE_CLICK_DELAY = 250

interface SurfaceClickGesturesOptions {
  /** 是否启用单击切换播放；关闭时单击不做任何事，双击照常 */
  clickEnabled: boolean
  onClick: () => void
  onDoubleClick: () => void
}

/**
 * 画面层的单击 / 双击手势。
 *
 * 双击会先派发两次 click，若单击立即切换播放，双击全屏时画面会先停再走。
 * 因此单击延后执行，在等待期内出现第二下就取消，交给双击处理。
 */
export const useSurfaceClickGestures = ({
  clickEnabled,
  onClick,
  onDoubleClick,
}: SurfaceClickGesturesOptions) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 定时器触发时读取最新回调，避免闭包拿到旧的播放状态
  const onClickRef = useRef(onClick)
  onClickRef.current = onClick

  const cancelPendingClick = useCallback(() => {
    if (timerRef.current === null) return
    clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  useEffect(() => {
    if (!clickEnabled) cancelPendingClick()
  }, [cancelPendingClick, clickEnabled])
  useEffect(() => cancelPendingClick, [cancelPendingClick])

  const handleClick = useCallback(
    (event: MouseEvent) => {
      cancelPendingClick()
      // detail > 1 是连击中的后续点击，属于双击，不再安排单击
      if (!clickEnabled || event.button !== 0 || event.detail > 1) return
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        onClickRef.current()
      }, SINGLE_CLICK_DELAY)
    },
    [cancelPendingClick, clickEnabled],
  )

  const handleDoubleClick = useCallback(() => {
    cancelPendingClick()
    onDoubleClick()
  }, [cancelPendingClick, onDoubleClick])

  return { onClick: handleClick, onDoubleClick: handleDoubleClick }
}
