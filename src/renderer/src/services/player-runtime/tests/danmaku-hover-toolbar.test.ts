import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DanmakuHoverToolbar } from '../danmaku/hover-toolbar'

/**
 * 测试环境没有 DOM，这里只实现工具条用到的最小子集。
 * 覆盖的是悬停状态机（驻留、连续悬停区域、释放），不覆盖真实布局与样式。
 */
class FakeNode {
  parent: FakeNode | null = null
  children: FakeNode[] = []
  contains(target: FakeNode | null): boolean {
    for (let node = target; node; node = node.parent) if (node === this) return true
    return false
  }
}

type Listener = (event: FakeEvent) => void
interface FakeEvent {
  relatedTarget: FakeNode | null
  stopPropagation: () => void
  preventDefault: () => void
}

class FakeElement extends FakeNode {
  dataset: Record<string, string> = {}
  className = ''
  type = ''
  title = ''
  tabIndex = 0
  attributes: Record<string, string> = {}
  style: Record<string, unknown> & { setProperty: (name: string, value: string) => void } = {
    setProperty: (name, value) => {
      this.style[name] = value
    },
  }

  rect = { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }
  offsetWidth = 80
  offsetHeight = 46
  onclick: Listener | null = null
  ondblclick: Listener | null = null
  onmouseleave: Listener | null = null
  onmousedown: Listener | null = null

  get isConnected(): boolean {
    return this.parent !== null
  }

  append(...nodes: FakeNode[]): void {
    for (const node of nodes) {
      node.parent = this
      this.children.push(node)
    }
  }

  remove(): void {
    if (!this.parent) return
    this.parent.children = this.parent.children.filter((child) => child !== this)
    this.parent = null
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value
  }

  getBoundingClientRect() {
    return this.rect
  }
}

const event = (relatedTarget: FakeNode | null = null) => ({
  relatedTarget,
  stopPropagation: vi.fn(),
  preventDefault: vi.fn(),
})

const setup = () => {
  const container = new FakeElement()
  container.rect = { left: 0, right: 1000, top: 0, bottom: 500, width: 1000, height: 500 }
  const node = new FakeElement()
  node.rect = { left: 200, right: 400, top: 100, bottom: 136, width: 200, height: 36 }
  container.append(node)
  const handlers = { onCopy: vi.fn(), onBlock: vi.fn(), onLeave: vi.fn() }
  const toolbar = new DanmakuHoverToolbar(container as unknown as HTMLElement, handlers)
  const element = container.children.at(-1) as FakeElement
  // 外层命中区域内依次是箭头和承载按钮的胶囊
  const [arrow, pill] = element.children as FakeElement[]
  const [copyButton, blockButton] = pill.children as FakeElement[]
  return { container, node, handlers, toolbar, element, arrow, copyButton, blockButton }
}

const attach = (toolbar: DanmakuHoverToolbar, id: string, node: FakeElement, clientX = 300) =>
  toolbar.attach(id, node as unknown as HTMLElement, clientX)

describe('弹幕悬停工具条', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('Node', FakeNode)
    vi.stubGlobal('document', { createElement: () => new FakeElement() })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('创建时隐藏，包含带文字说明的复制与屏蔽两个按钮', () => {
    const { element, copyButton, blockButton } = setup()
    expect(element.style.display).toBe('none')
    expect([copyButton.title, blockButton.title]).toEqual(['复制', '屏蔽'])
    expect(copyButton.attributes['aria-label']).toBe('复制')
    expect(blockButton.attributes['aria-label']).toBe('屏蔽')
  })

  it('驻留约 150 毫秒后才显示，定位到文字正下方的鼠标位置，箭头朝上指向文字', () => {
    const { toolbar, node, element, arrow } = setup()
    attach(toolbar, 'a', node)
    vi.advanceTimersByTime(149)
    expect(element.style.display).toBe('none')

    vi.advanceTimersByTime(1)
    expect(element.style.display).toBe('flex')
    // 鼠标在 x=300：工具条宽 80，水平居中于鼠标；纵向紧贴文字底边并重叠 2px
    expect(element.style.transform).toBe('translate(260px, 134px)')
    expect(element.style.flexDirection).toBe('column')
    expect(arrow.style.marginLeft).toBe('34px')
    expect(String(arrow.style.borderBottom)).toContain('solid')
  })

  it('驻留期间鼠标在文字上移动，以显示那一刻的位置为准；显示后不再跟随', () => {
    const { toolbar, node, element } = setup()
    attach(toolbar, 'a', node, 220)
    toolbar.track('a', 380)
    toolbar.track('other', 250)
    vi.advanceTimersByTime(150)
    expect(element.style.transform).toBe('translate(340px, 134px)')

    toolbar.track('a', 240)
    expect(element.style.transform).toBe('translate(340px, 134px)')
  })

  it('靠近画面底部的弹幕，工具条翻到文字上方，箭头朝下', () => {
    const { toolbar, node, element, arrow } = setup()
    node.rect = { left: 200, right: 400, top: 440, bottom: 476, width: 200, height: 36 }
    attach(toolbar, 'a', node)
    vi.advanceTimersByTime(150)
    expect(element.style.transform).toBe('translate(260px, 396px)')
    expect(element.style.flexDirection).toBe('column-reverse')
    expect(String(arrow.style.borderTop)).toContain('solid')
  })

  it('驻留不足就离开时不显示', () => {
    const { toolbar, node, element } = setup()
    attach(toolbar, 'a', node)
    vi.advanceTimersByTime(100)
    toolbar.release('a')
    vi.advanceTimersByTime(500)
    expect(element.style.display).toBe('none')
  })

  it('切换到另一条弹幕时重新计时，同一时刻只服务一条', () => {
    const { toolbar, node, container, element, handlers, copyButton } = setup()
    const other = new FakeElement()
    other.rect = { left: 500, right: 600, top: 200, bottom: 236, width: 100, height: 36 }
    container.append(other)

    attach(toolbar, 'a', node)
    vi.advanceTimersByTime(100)
    attach(toolbar, 'b', other, 550)
    vi.advanceTimersByTime(100)
    expect(element.style.display).toBe('none')
    vi.advanceTimersByTime(50)
    expect(element.style.transform).toBe('translate(510px, 234px)')

    copyButton.onclick?.(event())
    expect(handlers.onCopy).toHaveBeenCalledWith('b')
  })

  it('能识别事件目标落在工具条内，供弹幕文字判断鼠标是否移到了工具条上', () => {
    const { toolbar, node, element, blockButton } = setup()
    expect(toolbar.contains(blockButton as unknown as EventTarget)).toBe(true)
    expect(toolbar.contains(element as unknown as EventTarget)).toBe(true)
    expect(toolbar.contains(node as unknown as EventTarget)).toBe(false)
    expect(toolbar.contains(null)).toBe(false)
  })

  it('鼠标从工具条回到原弹幕不算离开，移到别处才通知结束悬停', () => {
    const { toolbar, node, element, handlers } = setup()
    attach(toolbar, 'a', node)
    vi.advanceTimersByTime(150)

    element.onmouseleave?.(event(node))
    expect(handlers.onLeave).not.toHaveBeenCalled()

    element.onmouseleave?.(event(null))
    expect(handlers.onLeave).toHaveBeenCalledWith('a')
  })

  it('回到同一条弹幕时保持显示，不重新计时', () => {
    const { toolbar, node, element } = setup()
    attach(toolbar, 'a', node)
    vi.advanceTimersByTime(150)
    attach(toolbar, 'a', node)
    expect(element.style.display).toBe('flex')
  })

  it('被悬停的弹幕从画面移除时一并隐藏，其他弹幕的释放不影响它', () => {
    const { toolbar, node, element } = setup()
    attach(toolbar, 'a', node)
    vi.advanceTimersByTime(150)

    toolbar.release('other')
    expect(element.style.display).toBe('flex')
    toolbar.release('a')
    expect(element.style.display).toBe('none')
  })

  it('到点时弹幕节点已不在画面上则不显示', () => {
    const { toolbar, node, element } = setup()
    attach(toolbar, 'a', node)
    node.remove()
    vi.advanceTimersByTime(150)
    expect(element.style.display).toBe('none')
  })

  it('按钮触发对应操作，点击与双击都不冒泡成播放器手势', () => {
    const { toolbar, node, element, handlers, copyButton, blockButton } = setup()
    attach(toolbar, 'a', node)
    vi.advanceTimersByTime(150)

    const click = event()
    blockButton.onclick?.(click)
    expect(handlers.onBlock).toHaveBeenCalledWith('a')
    expect(click.stopPropagation).toHaveBeenCalled()

    const doubleClick = event()
    element.ondblclick?.(doubleClick)
    expect(doubleClick.stopPropagation).toHaveBeenCalled()

    // 阻止按钮获得焦点，否则之后的空格会再次触发按钮而不是播放器快捷键
    const mouseDown = event()
    copyButton.onmousedown?.(mouseDown)
    expect(mouseDown.preventDefault).toHaveBeenCalled()
  })

  it('隐藏后按钮不再触发操作，销毁时移除元素', () => {
    const { toolbar, node, container, element, handlers, copyButton } = setup()
    attach(toolbar, 'a', node)
    vi.advanceTimersByTime(150)
    toolbar.hide()
    copyButton.onclick?.(event())
    expect(handlers.onCopy).not.toHaveBeenCalled()

    toolbar.dispose()
    expect(container.children).not.toContain(element)
  })
})
