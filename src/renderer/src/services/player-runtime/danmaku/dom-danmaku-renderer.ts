import type {
  DanmakuConfig,
  DanmakuDiagnostics,
  DanmakuItem,
  DanmakuMetrics,
  DanmakuPlacement,
  DanmakuRect,
} from '@marchen/danmaku-engine'
import type { PlaybackClock } from '@marchen/playback-core'
import { DanmakuEngineCore, DanmakuNodePool } from '@marchen/danmaku-engine'

export interface DomDanmakuConfig extends Partial<DanmakuConfig> {
  hoverPause?: boolean
  opacity?: number
}

interface ActiveAnimation {
  node: HTMLSpanElement
  animation: Animation
  duration: number
}

interface MeasuredCandidate {
  item: DanmakuItem
  metrics: DanmakuMetrics | null
  node: HTMLSpanElement | null
}

/** 只维护一个播放 rAF；React 不参与逐帧弹幕调度。 */
export class DomDanmakuRenderer {
  private config: DomDanmakuConfig
  private readonly engine: DanmakuEngineCore
  private readonly pool: DanmakuNodePool<HTMLSpanElement>
  private readonly animations = new Map<string, ActiveAnimation>()
  private readonly hoverPaused = new Set<string>()
  private readonly measurementLayer: HTMLDivElement
  private readonly metricsCache = new Map<string, DanmakuMetrics>()
  private readonly resizeObserver: ResizeObserver
  private frameId: number | null = null
  private resizeFrameId: number | null = null
  private lastRevision = 0
  private lastWidth = -1
  private lastHeight = -1
  private styleRevision = 0
  private playing = false
  private destroyed = false

  constructor(
    private readonly container: HTMLElement,
    clock: PlaybackClock,
    config: DomDanmakuConfig = {},
  ) {
    this.config = config
    this.engine = new DanmakuEngineCore(clock, undefined, config)
    this.pool = new DanmakuNodePool(240, createDanmakuNode, resetNode)
    this.measurementLayer = createMeasurementLayer()
    this.container.append(this.measurementLayer)
    this.applyOpacity(config.opacity)
    this.resizeObserver = new ResizeObserver(() => this.scheduleResize())
    this.resizeObserver.observe(container)
    this.resize(true)

    // Web 字体异步就绪后旧尺寸不再可信，需要与配置变更一样原子重建占用。
    void document.fonts?.ready.then(() => {
      if (this.destroyed) return
      this.invalidateMeasurements()
      this.resize(true)
    })
  }

  replaceItems(items: ReadonlyArray<DanmakuItem>, currentTime: number): void {
    this.clearNodes()
    this.engine.replaceItems(items, currentTime)
    this.lastRevision = this.engine.revision
    this.refreshDiagnostics()
  }

  play(): void {
    if (this.destroyed) return
    this.playing = true
    this.engine.play()
    this.animations.forEach(({ animation }, id) => {
      if (!this.hoverPaused.has(id)) animation.play()
    })
    this.startLoop()
  }

  pause(): void {
    this.playing = false
    this.engine.pause()
    this.stopLoop()
    this.animations.forEach(({ animation }) => animation.pause())
  }

  seek(time: number): void {
    this.clearNodes()
    this.engine.seek(time)
    this.lastRevision = this.engine.revision
    this.refreshDiagnostics()
  }

  setRate(rate: number): void {
    this.engine.setRate(rate)
    this.animations.forEach(({ animation }) => {
      animation.playbackRate = rate
    })
  }

  updateConfig(config: DomDanmakuConfig): void {
    const previous = this.config
    const next = { ...previous, ...config }
    const requiresReset = requiresDanmakuLayoutReset(previous, next)
    const durationChanged = previous.duration !== next.duration
    const hoverPauseChanged = previous.hoverPause !== next.hoverPause
    const opacityChanged = previous.opacity !== next.opacity
    this.config = next

    if (previous.fontSize !== next.fontSize) this.invalidateMeasurements()
    this.engine.updateConfig(config, requiresReset)
    if (requiresReset) {
      this.clearNodes()
      this.lastRevision = this.engine.revision
    } else {
      if (durationChanged && next.duration) this.rebaseAnimationDurations(next.duration)
      if (hoverPauseChanged) {
        this.animations.forEach((active, id) => this.bindHoverBehavior(id, active))
      }
    }
    if (opacityChanged) this.applyOpacity(next.opacity)
    this.refreshDiagnostics()
  }

  setExclusionRect(rect: DanmakuRect | null): void {
    // 控制器位置连续变化只更新约束；已有弹幕继续运动，不清空占用。
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
    this.measurementLayer.remove()
  }

  get activeNodeCount() {
    return this.pool.activeCount
  }

  getDiagnostics(): DanmakuDiagnostics {
    return this.engine.getDiagnostics()
  }

  getVisibleRects(): DOMRect[] {
    return [...this.animations.values()].map(({ node }) => node.getBoundingClientRect())
  }

  getMotionSnapshot(id: string) {
    return this.engine.getMotionSnapshot(id)
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
      this.renderCandidates(this.engine.collectCandidates())
      this.refreshDiagnostics()
      this.frameId = requestAnimationFrame(frame)
    }
    this.frameId = requestAnimationFrame(frame)
  }

  private stopLoop(): void {
    if (this.frameId === null) return
    cancelAnimationFrame(this.frameId)
    this.frameId = null
  }

  private renderCandidates(items: ReadonlyArray<DanmakuItem>): void {
    if (items.length === 0) return
    const candidates = this.measureCandidates(items)
    const placements = this.engine.placeCandidates(
      candidates.map(({ item, metrics }) => ({ item, metrics })),
    )
    const placementById = new Map(placements.map((placement) => [placement.item.id, placement]))

    for (const candidate of candidates) {
      if (!candidate.node) continue
      const placement = placementById.get(candidate.item.id)
      if (placement) this.renderPlacement(candidate.node, placement)
      else this.releaseUnplacedNode(candidate.node)
    }
  }

  /** 先统一写 DOM，再集中读布局，避免逐条读写交错造成 layout thrashing。 */
  private measureCandidates(items: ReadonlyArray<DanmakuItem>): MeasuredCandidate[] {
    const candidates = items.map<MeasuredCandidate>((item) => {
      const node = this.pool.acquire()
      if (!node) return { item, metrics: null, node: null }
      prepareMeasureNode(node, item, this.config.fontSize ?? 26)
      this.measurementLayer.append(node)
      return { item, metrics: this.metricsCache.get(this.getMetricsKey(item)) ?? null, node }
    })

    for (const candidate of candidates) {
      if (!candidate.node || candidate.metrics) continue
      const rect = candidate.node.getBoundingClientRect()
      const fontSize = candidate.item.fontSize ?? this.config.fontSize ?? 26
      const metrics = normalizeMeasuredMetrics(rect, candidate.item.text, fontSize)
      this.metricsCache.set(this.getMetricsKey(candidate.item), metrics)
      candidate.metrics = metrics
    }
    return candidates
  }

  private renderPlacement(node: HTMLSpanElement, placement: DanmakuPlacement): void {
    prepareNode(
      node,
      placement,
      this.container.clientWidth,
      Boolean(this.config.hoverPause),
      this.config.fontSize ?? 26,
    )
    this.container.append(node)
    const animation = createAnimation(node, placement, this.container.clientWidth)
    node.style.visibility = 'visible'
    animation.playbackRate = placement.playbackRate
    const active = { node, animation, duration: placement.duration }
    this.animations.set(placement.item.id, active)
    this.bindHoverBehavior(placement.item.id, active)

    void animation.finished.then(
      () => this.releaseNode(placement.item.id, true),
      () => {},
    )
  }

  private releaseNode(id: string, completed = false): void {
    const active = this.animations.get(id)
    if (!active) return
    this.animations.delete(id)
    this.hoverPaused.delete(id)
    if (completed) this.engine.completeItem(id)
    else this.engine.cancelItem(id)
    active.animation.cancel()
    active.node.remove()
    this.pool.release(active.node)
  }

  private bindHoverBehavior(id: string, active: ActiveAnimation): void {
    active.node.onmouseenter = null
    active.node.onmouseleave = null
    if (!this.config.hoverPause) {
      if (this.hoverPaused.delete(id)) {
        this.engine.resumeItem(id)
        if (this.playing) active.animation.play()
      }
      active.node.style.pointerEvents = 'none'
      return
    }

    active.node.style.pointerEvents = 'auto'
    active.node.onmouseenter = () => {
      // 先冻结调度时钟，再冻结视觉动画，保证碰撞预测与画面状态同序。
      this.engine.pauseItem(id)
      this.hoverPaused.add(id)
      active.animation.pause()
    }
    active.node.onmouseleave = () => {
      this.engine.resumeItem(id)
      this.hoverPaused.delete(id)
      if (this.playing) active.animation.play()
    }
  }

  private releaseUnplacedNode(node: HTMLSpanElement): void {
    node.remove()
    this.pool.release(node)
  }

  private clearNodes(): void {
    for (const id of [...this.animations.keys()]) this.releaseNode(id)
    this.pool.releaseAll()
  }

  private scheduleResize(): void {
    if (this.resizeFrameId !== null) return
    this.resizeFrameId = requestAnimationFrame(() => {
      this.resizeFrameId = null
      this.resize()
    })
  }

  private resize(force = false): void {
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    if (!force && width === this.lastWidth && height === this.lastHeight) return
    this.lastWidth = width
    this.lastHeight = height
    this.engine.resize(width, height)
    this.clearNodes()
    this.lastRevision = this.engine.revision
    this.refreshDiagnostics()
  }

  private invalidateMeasurements(): void {
    this.styleRevision += 1
    this.metricsCache.clear()
  }

  private rebaseAnimationDurations(duration: number): void {
    this.animations.forEach((active) => {
      if (rebaseAnimationDuration(active.animation, active.duration, duration)) {
        active.duration = duration
      }
    })
  }

  private applyOpacity(opacity: number | undefined): void {
    this.container.style.opacity = String(clamp(opacity ?? 1, 0, 1))
  }

  private getMetricsKey(item: DanmakuItem) {
    return `${this.styleRevision}:${item.fontSize ?? this.config.fontSize ?? 26}:${item.text}`
  }

  private refreshDiagnostics(): void {
    const diagnostics = this.engine.getDiagnostics()
    this.container.dataset.danmakuActive = String(diagnostics.active)
    this.container.dataset.danmakuPeakActive = String(diagnostics.peakActive)
    this.container.dataset.danmakuDropped = String(diagnostics.dropped)
  }
}

const createMeasurementLayer = () => {
  const layer = document.createElement('div')
  layer.dataset.danmakuMeasurementLayer = ''
  layer.style.position = 'absolute'
  layer.style.inset = '0'
  layer.style.visibility = 'hidden'
  layer.style.pointerEvents = 'none'
  layer.style.overflow = 'hidden'
  layer.style.contain = 'layout style paint'
  return layer
}

const createDanmakuNode = () => document.createElement('span')

const applyTextStyle = (node: HTMLSpanElement, item: DanmakuItem, defaultFontSize: number) => {
  node.textContent = item.text
  node.className = 'absolute top-0 left-0 whitespace-nowrap font-semibold will-change-transform'
  node.style.color = item.color
  node.style.fontSize = `${item.fontSize ?? defaultFontSize}px`
  node.style.lineHeight = '1.35'
  node.style.textShadow = '0 1px 2px rgb(0 0 0 / 90%), 1px 0 1px rgb(0 0 0 / 70%)'
}

const prepareMeasureNode = (node: HTMLSpanElement, item: DanmakuItem, defaultFontSize: number) => {
  applyTextStyle(node, item, defaultFontSize)
  node.style.position = 'absolute'
  node.style.width = 'max-content'
  node.style.transform = 'none'
  node.style.visibility = 'hidden'
  node.style.pointerEvents = 'none'
}

const prepareNode = (
  node: HTMLSpanElement,
  placement: DanmakuPlacement,
  viewportWidth: number,
  hoverPause: boolean,
  defaultFontSize: number,
) => {
  node.dataset.danmakuNode = placement.item.id
  node.dataset.danmakuMode = placement.item.mode
  node.dataset.danmakuLane = String(placement.lane)
  applyTextStyle(node, placement.item, defaultFontSize)
  node.style.width = ''
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

/** 修改 WAAPI timing 时同步换算 currentTime，避免节点跳回起点。 */
export const rebaseAnimationDuration = (
  animation: Animation,
  previousDuration: number,
  nextDuration: number,
) => {
  const effect = animation.effect
  if (
    !effect ||
    !Number.isFinite(previousDuration) ||
    previousDuration <= 0 ||
    !Number.isFinite(nextDuration) ||
    nextDuration <= 0
  ) {
    return false
  }
  const timing = effect.getTiming()
  const delay = typeof timing.delay === 'number' ? timing.delay : 0
  const currentTime = typeof animation.currentTime === 'number' ? animation.currentTime : null
  const previousDurationMs = previousDuration * 1_000
  const nextDurationMs = nextDuration * 1_000
  const nextCurrentTime =
    currentTime !== null && currentTime > delay
      ? delay + clamp((currentTime - delay) / previousDurationMs, 0, 1) * nextDurationMs
      : currentTime

  effect.updateTiming({ duration: nextDurationMs })
  if (nextCurrentTime !== null) animation.currentTime = nextCurrentTime
  return true
}

export const normalizeMeasuredMetrics = (
  rect: Pick<DOMRect, 'width' | 'height'>,
  text: string,
  fontSize: number,
): DanmakuMetrics => ({
  width: rect.width > 0 ? rect.width : Math.max(1, text.length * fontSize),
  height: rect.height > 0 ? rect.height : Math.max(1, fontSize * 1.35),
})

export const requiresDanmakuLayoutReset = (previous: DomDanmakuConfig, next: DomDanmakuConfig) =>
  previous.enabled !== next.enabled || previous.laneGap !== next.laneGap

const resetNode = (node: HTMLSpanElement) => {
  node.onmouseenter = null
  node.onmouseleave = null
  node.textContent = ''
  node.className = ''
  node.removeAttribute('style')
  for (const key of Object.keys(node.dataset)) delete node.dataset[key]
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value))
