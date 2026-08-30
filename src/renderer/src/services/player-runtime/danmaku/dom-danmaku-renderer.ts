import type {
  DanmakuConfig,
  DanmakuItem,
  DanmakuPlacement,
  DanmakuRect,
} from '@marchen/danmaku-engine'
import type { PlaybackClock } from '@marchen/playback-core'
import { DanmakuEngineCore, DanmakuNodePool } from '@marchen/danmaku-engine'

export interface DomDanmakuConfig extends Partial<DanmakuConfig> {
  hoverPause?: boolean
}

/** 只维护一个播放 rAF；React 不参与逐帧弹幕调度。 */
export class DomDanmakuRenderer {
  private config: DomDanmakuConfig
  private readonly engine: DanmakuEngineCore
  private readonly pool: DanmakuNodePool<HTMLSpanElement>
  private readonly animations = new Map<HTMLSpanElement, Animation>()
  private readonly resizeObserver: ResizeObserver
  private frameId: number | null = null
  private resizeFrameId: number | null = null
  private lastRevision = 0
  private playing = false
  private destroyed = false

  constructor(
    private readonly container: HTMLElement,
    clock: PlaybackClock,
    config: DomDanmakuConfig = {},
  ) {
    this.config = config
    this.engine = new DanmakuEngineCore(clock, (item) => this.measure(item), config)
    this.pool = new DanmakuNodePool(240, createDanmakuNode, resetNode)
    this.resizeObserver = new ResizeObserver(() => this.scheduleResize())
    this.resizeObserver.observe(container)
    this.resize()
  }

  replaceItems(items: ReadonlyArray<DanmakuItem>, currentTime: number): void {
    this.clearNodes()
    this.engine.replaceItems(items, currentTime)
    this.lastRevision = this.engine.revision
  }

  play(): void {
    if (this.destroyed) return
    this.playing = true
    this.engine.play()
    this.animations.forEach((animation) => animation.play())
    this.startLoop()
  }

  pause(): void {
    this.playing = false
    this.engine.pause()
    this.stopLoop()
    this.animations.forEach((animation) => animation.pause())
  }

  seek(time: number): void {
    this.clearNodes()
    this.engine.seek(time)
    this.lastRevision = this.engine.revision
  }

  setRate(rate: number): void {
    this.engine.setRate(rate)
    this.animations.forEach((animation) => {
      animation.playbackRate = rate
    })
  }

  updateConfig(config: DomDanmakuConfig): void {
    this.config = { ...this.config, ...config }
    this.engine.updateConfig(config)
    this.clearNodes()
    this.lastRevision = this.engine.revision
  }

  setExclusionRect(rect: DanmakuRect | null): void {
    this.engine.setExclusionRect(rect)
  }

  setExclusionRectFromViewport(rect: DOMRect | null): void {
    if (!rect) {
      this.setExclusionRect(null)
      return
    }
    const surface = this.container.getBoundingClientRect()
    this.setExclusionRect({
      left: rect.left - surface.left,
      right: rect.right - surface.left,
      top: rect.top - surface.top,
      bottom: rect.bottom - surface.top,
    })
  }

  dispose(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.stopLoop()
    if (this.resizeFrameId !== null) cancelAnimationFrame(this.resizeFrameId)
    this.resizeObserver.disconnect()
    this.clearNodes()
    this.container.replaceChildren()
  }

  get activeNodeCount() {
    return this.pool.activeCount
  }

  private startLoop(): void {
    if (this.frameId !== null || !this.playing) return
    const frame = () => {
      if (!this.playing || this.destroyed) {
        this.frameId = null
        return
      }
      if (this.lastRevision !== this.engine.revision) {
        this.clearNodes()
        this.lastRevision = this.engine.revision
      }
      this.engine.tick().forEach((placement) => this.renderPlacement(placement))
      this.frameId = requestAnimationFrame(frame)
    }
    this.frameId = requestAnimationFrame(frame)
  }

  private stopLoop(): void {
    if (this.frameId === null) return
    cancelAnimationFrame(this.frameId)
    this.frameId = null
  }

  private renderPlacement(placement: DanmakuPlacement): void {
    const node = this.pool.acquire()
    if (!node) return
    prepareNode(
      node,
      placement,
      this.container.clientWidth,
      Boolean(this.config.hoverPause),
      this.config.fontSize ?? 26,
    )
    this.container.append(node)
    const animation = createAnimation(node, placement, this.container.clientWidth)
    // 节点入池后会先完成初始定位，再参与绘制，避免 startDelay 期间暴露在左上角。
    node.style.visibility = 'visible'
    animation.playbackRate = placement.playbackRate
    this.animations.set(node, animation)

    if (this.config.hoverPause) {
      node.onmouseenter = () => animation.pause()
      node.onmouseleave = () => {
        if (this.playing) animation.play()
      }
    }

    void animation.finished.then(
      () => this.releaseNode(node),
      () => {},
    )
  }

  private releaseNode(node: HTMLSpanElement): void {
    const animation = this.animations.get(node)
    this.animations.delete(node)
    animation?.cancel()
    node.remove()
    this.pool.release(node)
  }

  private clearNodes(): void {
    for (const node of [...this.animations.keys()]) this.releaseNode(node)
    this.pool.releaseAll()
  }

  private scheduleResize(): void {
    if (this.resizeFrameId !== null) return
    this.resizeFrameId = requestAnimationFrame(() => {
      this.resizeFrameId = null
      this.resize()
    })
  }

  private resize(): void {
    this.engine.resize(this.container.clientWidth, this.container.clientHeight)
    this.clearNodes()
    this.lastRevision = this.engine.revision
  }

  private measure(item: DanmakuItem): number {
    const canvas = getMeasureCanvas()
    const context = canvas.getContext('2d')
    const fontSize = item.fontSize ?? this.config.fontSize ?? 26
    if (!context) return item.text.length * fontSize
    context.font = `600 ${fontSize}px Manrope, sans-serif`
    return context.measureText(item.text).width + 4
  }
}

let measureCanvas: HTMLCanvasElement | null = null
const getMeasureCanvas = () => (measureCanvas ??= document.createElement('canvas'))
const createDanmakuNode = () => document.createElement('span')

const prepareNode = (
  node: HTMLSpanElement,
  placement: DanmakuPlacement,
  viewportWidth: number,
  hoverPause: boolean,
  defaultFontSize: number,
) => {
  node.dataset.danmakuNode = placement.item.id
  node.textContent = placement.item.text
  node.className = 'absolute top-0 left-0 whitespace-nowrap font-semibold will-change-transform'
  node.style.color = placement.item.color
  node.style.fontSize = `${placement.item.fontSize ?? defaultFontSize}px`
  node.style.lineHeight = '1.35'
  node.style.textShadow = '0 1px 2px rgb(0 0 0 / 90%), 1px 0 1px rgb(0 0 0 / 70%)'
  node.style.pointerEvents = hoverPause ? 'auto' : 'none'
  node.style.visibility = 'hidden'
  node.style.transform = getDanmakuInitialTransform(placement, viewportWidth)
}

export const getDanmakuInitialTransform = (placement: DanmakuPlacement, viewportWidth: number) => {
  const x =
    placement.item.mode === 'scroll'
      ? viewportWidth
      : Math.max(0, (viewportWidth - placement.width) / 2)
  return `translate3d(${x}px, ${placement.y}px, 0)`
}

const createAnimation = (
  node: HTMLSpanElement,
  placement: DanmakuPlacement,
  viewportWidth: number,
) => {
  const timing = getDanmakuAnimationTiming(placement)
  if (placement.item.mode === 'scroll') {
    return node.animate(
      [
        { transform: `translate3d(${viewportWidth}px, ${placement.y}px, 0)` },
        { transform: `translate3d(${-placement.width}px, ${placement.y}px, 0)` },
      ],
      timing,
    )
  }
  return node.animate(
    [{ opacity: 0 }, { opacity: 1, offset: 0.05 }, { opacity: 1, offset: 0.95 }, { opacity: 0 }],
    timing,
  )
}

export const getDanmakuAnimationTiming = (
  placement: DanmakuPlacement,
): KeyframeAnimationOptions => ({
  duration: placement.duration * 1_000,
  delay: placement.startDelay * 1_000,
  // lookAhead 会产生短暂 delay；both 可让首关键帧在 delay 阶段立即生效。
  fill: 'both',
  easing: 'linear',
})

const resetNode = (node: HTMLSpanElement) => {
  node.onmouseenter = null
  node.onmouseleave = null
  node.textContent = ''
  node.className = ''
  node.removeAttribute('style')
  for (const key of Object.keys(node.dataset)) delete node.dataset[key]
}
