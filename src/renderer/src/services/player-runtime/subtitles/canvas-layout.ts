/**
 * 字幕画布的创建与布局：文本（libass）与位图（PGS）两块画布共用，保证两者覆盖同一块视频画面。
 * 画布只覆盖视频实际显示区域（不含黑边），按设备像素比设置像素尺寸，旋转由 CSS 变换完成。
 */

export function createSubtitleCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.style.position = 'absolute'
  canvas.style.top = '50%'
  canvas.style.left = '50%'
  canvas.style.pointerEvents = 'none'
  return canvas
}

export interface SubtitleLayoutInput {
  /** 视频内容尺寸（像素） */
  videoWidth: number
  videoHeight: number
  /** 播放器容器尺寸（CSS 像素） */
  containerWidth: number
  containerHeight: number
  /** 画面旋转角度：0 / 90 / 180 / 270 */
  rotation: number
  pixelRatio: number
}

export interface SubtitleLayout {
  cssWidth: number
  cssHeight: number
  pixelWidth: number
  pixelHeight: number
  rotation: number
}

/** 按 contain 规则把视频放进容器，得到字幕画布的 CSS 与像素尺寸；尺寸未知时返回 undefined */
export function computeSubtitleLayout(input: SubtitleLayoutInput): SubtitleLayout | undefined {
  const { videoWidth: width, videoHeight: height, rotation } = input
  if (!width || !height) return undefined
  const swapped = rotation === 90 || rotation === 270
  const scale = Math.min(
    input.containerWidth / (swapped ? height : width),
    input.containerHeight / (swapped ? width : height),
  )
  const cssWidth = width * scale
  const cssHeight = height * scale
  const pixelRatio = input.pixelRatio || 1
  return {
    cssWidth,
    cssHeight,
    pixelWidth: Math.max(1, Math.round(cssWidth * pixelRatio)),
    pixelHeight: Math.max(1, Math.round(cssHeight * pixelRatio)),
    rotation,
  }
}

/** 把布局应用到画布；只在尺寸确实变化时改写 width / height，避免无谓清屏 */
export function applySubtitleLayout(canvas: HTMLCanvasElement, layout: SubtitleLayout) {
  if (canvas.width !== layout.pixelWidth) canvas.width = layout.pixelWidth
  if (canvas.height !== layout.pixelHeight) canvas.height = layout.pixelHeight
  canvas.style.width = `${layout.cssWidth}px`
  canvas.style.height = `${layout.cssHeight}px`
  canvas.style.transform = `translate(-50%, -50%) rotate(${layout.rotation}deg)`
}
