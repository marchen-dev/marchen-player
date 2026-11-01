// 手搭在鼠标上时常有 1～2px 的来回抖动，3px 以内不视为有意操作。
export const POINTER_JITTER_THRESHOLD = 3

export interface PointerPoint {
  x: number
  y: number
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
