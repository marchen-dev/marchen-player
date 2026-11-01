export const timelineTimeFromPointer = (
  clientX: number,
  left: number,
  width: number,
  duration: number,
) => {
  if (width <= 0 || !Number.isFinite(duration) || duration <= 0) return 0
  return clamp((clientX - left) / width, 0, 1) * duration
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum)

export interface PreviewBubblePlacement {
  /** 预览框中心相对进度条左边缘的位置（px） */
  center: number
  /** 小三角相对预览框中心的偏移（px），指向鼠标所在的时间点 */
  caretOffset: number
}

// 小三角离预览框圆角至少留出的距离，避免指向框外
const CARET_INSET = 8

/**
 * 计算预览框的水平位置：尽量以指针为中心，但整体不超出 [minLeft, maxRight]（控制栏边界，
 * 坐标相对进度条左边缘）。预览框比可用区域还宽时居中放置。
 */
export const placePreviewBubble = (
  pointerX: number,
  bubbleWidth: number,
  minLeft: number,
  maxRight: number,
): PreviewBubblePlacement => {
  const half = bubbleWidth / 2
  const lower = minLeft + half
  const upper = maxRight - half
  const center = lower > upper ? (minLeft + maxRight) / 2 : clamp(pointerX, lower, upper)
  const caretLimit = Math.max(0, half - CARET_INSET)
  return { center, caretOffset: clamp(pointerX - center, -caretLimit, caretLimit) }
}
