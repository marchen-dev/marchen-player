/**
 * 弹幕悬停工具条的定位计算，坐标均相对弹幕层容器。
 * 抽成纯函数，便于在没有 DOM 的环境里验证边缘情况。
 *
 * 工具条出现在弹幕文字的正下方、鼠标所在的水平位置，并用一个小箭头指回文字：
 * 鼠标向下一移就能点到，不必沿着一条很长的弹幕追到末端。
 */
export interface HoverToolbarPositionInput {
  /** 被悬停弹幕的矩形；滚动弹幕进出场时可能有一部分在容器外 */
  node: { left: number; right: number; top: number; bottom: number }
  /** 鼠标的水平位置 */
  cursorX: number
  /** 工具条整体尺寸，高度包含箭头 */
  toolbar: { width: number; height: number }
  container: { width: number; height: number }
  /** 工具条与文字的纵向重叠，用来消除亚像素缝隙，保证鼠标从文字移到工具条时不落空 */
  overlap: number
  /** 箭头中心距工具条左右边缘的最小距离，避免箭头落在圆角上 */
  arrowInset: number
}

export interface HoverToolbarPosition {
  left: number
  top: number
  /** 下方放不下（靠近画面底部的弹幕）时翻到文字上方 */
  placement: 'below' | 'above'
  /** 箭头中心相对工具条左边缘的位置 */
  arrowLeft: number
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(minimum, maximum), Math.max(minimum, value))

export const computeHoverToolbarPosition = ({
  node,
  cursorX,
  toolbar,
  container,
  overlap,
  arrowInset,
}: HoverToolbarPositionInput): HoverToolbarPosition => {
  // 锚点跟随鼠标，但限制在弹幕的可见部分内：驻留期间鼠标可能已经滑出文字一点
  const anchorX = clamp(cursorX, Math.max(0, node.left), Math.min(container.width, node.right))
  const left = clamp(anchorX - toolbar.width / 2, 0, container.width - toolbar.width)

  const below = node.bottom - overlap
  const above = node.top - toolbar.height + overlap
  // 优先放下方；下方出界且上方放得下时才翻转，两边都放不下就留在下方并夹进容器
  const placement = below + toolbar.height > container.height && above >= 0 ? 'above' : 'below'
  const top = clamp(placement === 'below' ? below : above, 0, container.height - toolbar.height)

  return {
    left,
    top,
    placement,
    // 工具条被容器边缘夹住时，箭头仍尽量指向鼠标所在位置
    arrowLeft: clamp(anchorX - left, arrowInset, toolbar.width - arrowInset),
  }
}
