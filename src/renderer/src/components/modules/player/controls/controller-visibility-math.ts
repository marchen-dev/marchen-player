// 手搭在鼠标上时常有 1～2px 的来回抖动，3px 以内不视为有意操作。
export const POINTER_JITTER_THRESHOLD = 3

export interface PointerPoint {
  x: number
  y: number
}

/** 原生拖动区也可能触发 DOM leave，必须用窗口坐标判断是否真的离窗。 */
export const isPointerInsideWindow = (point: PointerPoint, width: number, height: number) =>
  point.x >= 0 && point.y >= 0 && point.x < width && point.y < height

/** 离窗隐藏优先于暂停和悬停；拖动、面板或键盘焦点仍需保留操作界面。 */
export const resolveControllerVisibilityMode = ({
  pointerInside,
  keepVisibleOutsideWindow,
  playing,
  locked,
}: {
  pointerInside: boolean
  keepVisibleOutsideWindow: boolean
  playing: boolean
  locked: boolean
}): 'hidden' | 'visible' | 'auto' => {
  if (!pointerInside && !keepVisibleOutsideWindow) return 'hidden'
  if (!playing || locked || keepVisibleOutsideWindow) return 'visible'
  return 'auto'
}

/**
 * 判断指针是否离开了上次活动时的锚点。
 * 用相对锚点的直线位移而不是累计路程：来回抖动的路程会不断累加，位移却始终很小。
 * 没有锚点（首次移动）时视为有效活动。
 */
export const isIntentionalPointerMove = (
  anchor: PointerPoint | null,
  point: PointerPoint,
  threshold = POINTER_JITTER_THRESHOLD,
) => {
  if (!anchor) return true
  return Math.hypot(point.x - anchor.x, point.y - anchor.y) >= threshold
}
