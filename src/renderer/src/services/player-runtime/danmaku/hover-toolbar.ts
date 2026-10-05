/**
 * 弹幕悬停工具条：悬停画面上的一条弹幕时，在其旁边显示「复制」「屏蔽」两个操作。
 *
 * 工具条出现在文字正下方、鼠标所在的位置，带一个指回文字的小箭头。
 * 整个弹幕层只有这一个工具条元素，悬停谁就定位到谁旁边。不往弹幕节点里加子元素：
 * 弹幕节点是池化复用的，宽度还参与测量与碰撞计算，加子元素会同时污染这两处。
 * 工具条位于弹幕层内，弹幕层在全屏元素内，全屏时无需额外处理。
 */
import { computeHoverToolbarPosition } from './hover-toolbar-position'

/** 驻留这么久才显示，避免弹幕密集时鼠标划过画面一路闪出工具条 */
const SHOW_DELAY = 150
/** 与文字的纵向重叠，见定位函数说明 */
const OVERLAP = 2
/** 箭头的高度与半宽 */
const ARROW_SIZE = 6
/** 箭头中心距工具条边缘的最小距离，略大于圆角半径 */
const ARROW_INSET = 20
/** 胶囊与箭头必须同色，统一由这里给出；用内联样式而不是类名，保证两者完全一致 */
const SURFACE_COLOR = 'rgb(28 28 30 / 90%)'

export interface DanmakuHoverToolbarHandlers {
  onCopy: (id: string) => void
  onBlock: (id: string) => void
  /** 鼠标离开工具条且没有回到原弹幕：由渲染器结束这条弹幕的悬停并恢复运动 */
  onLeave: (id: string) => void
}

export class DanmakuHoverToolbar {
  private readonly element: HTMLDivElement
  private readonly arrow: HTMLDivElement
  private cursorX = 0
  private targetId: string | null = null
  private targetNode: HTMLElement | null = null
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly container: HTMLElement,
    handlers: DanmakuHoverToolbarHandlers,
  ) {
    // 外层是透明的命中区域，把箭头所在的那几像素也算进工具条：
    // 鼠标从文字移向按钮时会经过箭头两侧的空白，这段不能被判定为离开。
    const element = document.createElement('div')
    element.dataset.danmakuHoverToolbar = ''
    // 类名必须是完整字面量，Tailwind 才能扫描到
    element.className = 'absolute top-0 left-0 z-[1] flex flex-col'
    element.style.display = 'none'
    element.style.pointerEvents = 'auto'
    element.style.setProperty('-webkit-app-region', 'no-drag')

    const arrow = document.createElement('div')
    arrow.setAttribute('aria-hidden', 'true')
    arrow.style.width = '0'
    arrow.style.height = '0'
    arrow.style.borderLeft = `${ARROW_SIZE}px solid transparent`
    arrow.style.borderRight = `${ARROW_SIZE}px solid transparent`

    const pill = document.createElement('div')
    pill.className = 'flex items-center gap-1 rounded-full px-2 py-1 text-white shadow-lg'
    pill.style.backgroundColor = SURFACE_COLOR
    pill.append(
      createButton('复制', 'icon-[mingcute--copy-2-line] size-5', () => {
        if (this.targetId !== null) handlers.onCopy(this.targetId)
      }),
      createButton('屏蔽', 'icon-[mingcute--forbid-circle-line] size-5', () => {
        if (this.targetId !== null) handlers.onBlock(this.targetId)
      }),
    )
    element.append(arrow, pill)
    // 工具条上的点击不能冒泡成播放器手势
    element.onclick = (event) => event.stopPropagation()
    element.ondblclick = (event) => event.stopPropagation()
    element.onmouseleave = (event) => {
      const id = this.targetId
      if (id === null) return
      // 回到原弹幕文字上仍属于同一次悬停
      if (isInside(this.targetNode, event.relatedTarget)) return
      handlers.onLeave(id)
    }
    this.element = element
    this.arrow = arrow
    container.append(element)
  }

  /** 开始悬停一条弹幕：此时弹幕已暂停，驻留到点后才显示。clientX 为鼠标的视口横坐标 */
  attach(id: string, node: HTMLElement, clientX: number): void {
    // 鼠标从工具条回到同一条弹幕：保持现状，不重新计时
    if (this.targetId === id && this.targetNode === node) return
    this.hide()
    this.targetId = id
    this.targetNode = node
    this.cursorX = clientX
    this.timer = setTimeout(() => {
      this.timer = null
      this.show()
    }, SHOW_DELAY)
  }

  /** 驻留期间鼠标还在文字上移动：记下最新位置，显示时以它为准；显示后不再跟随 */
  track(id: string, clientX: number): void {
    if (this.targetId === id && this.timer !== null) this.cursorX = clientX
  }

  /** 事件目标是否落在工具条内，用于判断鼠标是从文字移到了工具条上 */
  contains(target: EventTarget | null): boolean {
    return isInside(this.element, target)
  }

  /** 某条弹幕从画面移除（播完、跳转、被屏蔽、清屏）时调用 */
  release(id: string): void {
    if (this.targetId === id) this.hide()
  }

  hide(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    this.targetId = null
    this.targetNode = null
    this.element.style.display = 'none'
  }

  dispose(): void {
    this.hide()
    this.element.remove()
  }

  private show(): void {
    const node = this.targetNode
    if (!node?.isConnected) {
      this.hide()
      return
    }
    // 先显示再读尺寸；弹幕已暂停，位置稳定，读一次即可
    this.element.style.display = 'flex'
    const containerRect = this.container.getBoundingClientRect()
    const nodeRect = node.getBoundingClientRect()
    const { left, top, placement, arrowLeft } = computeHoverToolbarPosition({
      node: {
        left: nodeRect.left - containerRect.left,
        right: nodeRect.right - containerRect.left,
        top: nodeRect.top - containerRect.top,
        bottom: nodeRect.bottom - containerRect.top,
      },
      cursorX: this.cursorX - containerRect.left,
      toolbar: { width: this.element.offsetWidth, height: this.element.offsetHeight },
      container: { width: containerRect.width, height: containerRect.height },
      overlap: OVERLAP,
      arrowInset: ARROW_INSET,
    })
    this.element.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`

    // 箭头始终在靠近文字的一侧：工具条在下方时朝上，翻到上方时朝下
    const below = placement === 'below'
    this.element.style.flexDirection = below ? 'column' : 'column-reverse'
    this.arrow.style.marginLeft = `${Math.round(arrowLeft - ARROW_SIZE)}px`
    this.arrow.style.borderBottom = below ? `${ARROW_SIZE}px solid ${SURFACE_COLOR}` : '0'
    this.arrow.style.borderTop = below ? '0' : `${ARROW_SIZE}px solid ${SURFACE_COLOR}`
  }
}

const isInside = (parent: HTMLElement | null, target: EventTarget | null) =>
  parent !== null && target instanceof Node && parent.contains(target)

const createButton = (label: string, iconClassName: string, onClick: () => void) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.title = label
  button.setAttribute('aria-label', label)
  // 弹幕层整体对辅助技术隐藏，按钮不进入 Tab 顺序
  button.tabIndex = -1
  button.className =
    'flex size-9 items-center justify-center rounded-full text-white/90 hover:bg-white/15 hover:text-white'
  const icon = document.createElement('span')
  icon.setAttribute('aria-hidden', 'true')
  icon.className = iconClassName
  button.append(icon)
  // 阻止按钮获得焦点：否则之后按空格会再次触发按钮，而不是播放器的暂停快捷键
  button.onmousedown = (event) => event.preventDefault()
  button.onclick = (event) => {
    event.stopPropagation()
    onClick()
  }
  return button
}
