import type {
  DanmakuConfig,
  DanmakuDiagnostics,
  DanmakuItem,
  DanmakuMetrics,
  DanmakuPlacement,
  DanmakuRect,
} from '@marchen/danmaku-engine'
import type { PlaybackClock } from '@marchen/playback-core'
import type { DanmakuStageSize } from './resize-settler'
import { DanmakuEngineCore, DanmakuNodePool } from '@marchen/danmaku-engine'
import { toast } from '@renderer/components/ui/toast/use-toast'
import { CONTENT_LANG, t } from '@renderer/lib/i18n'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'
import { reportOperationalError } from '@renderer/services/telemetry/operational-errors'
import { DanmakuHoverToolbar } from './hover-toolbar'
import { DanmakuResizeSettler } from './resize-settler'
import { DanmakuRestoreBudgetError, prepareSeekRestoration } from './seek-restoration'

/** 恢复失败上报的 operation，用来区分 seek 落点与尺寸变化触发的重建。 */
type RestoreOperation = 'danmaku_seek_restore' | 'danmaku_resize_restore'

export interface DomDanmakuConfig extends Partial<DanmakuConfig> {
  hoverPause?: boolean
  opacity?: number
}

export interface DomDanmakuRendererOptions {
  /** 用户在悬停工具条上点了「屏蔽」；渲染器不接触设置，只把弹幕文本交给调用方 */
  onBlock?: (text: string) => void
}

/** 返回一条弹幕此刻应显示的文本；默认就是条目自身的文本 */
export type DanmakuTextResolver = (item: DanmakuItem) => string

interface ActiveAnimation {
  node: HTMLSpanElement
  animation: Animation
  duration: number
  /** 条目自身的文本。复制与屏蔽始终用它，而不是画面上可能已被替换的显示文本 */
  originalText: string
  /** 画面上实际显示的文本（开启弹幕翻译时可能是译文） */
  displayText: string
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
  private readonly displayLayer: HTMLDivElement
  private readonly measurementLayer: HTMLDivElement
  private readonly hoverToolbar: DanmakuHoverToolbar
  private readonly metricsCache = new Map<string, DanmakuMetrics>()
  private resolveText: DanmakuTextResolver = (item) => item.text
  /**
   * 测量时为每条候选定下的显示文本，上屏时取用同一份。
   * 译文可能在测量与上屏之间到达（seek 恢复是异步的），两处必须一致，否则宽度与文字对不上。
   */
  private readonly displayTexts = new Map<string, string>()
  private readonly resizeObserver: ResizeObserver
  private readonly resizeSettler: DanmakuResizeSettler
  private frameId: number | null = null
  private lastRevision = 0
  private lastWidth = -1
  private lastHeight = -1
  private styleRevision = 0
  private recovery: AbortController | null = null
  private seekTarget: number | null = null
  private exclusionRect: DanmakuRect | null = null
  private playing = false
  private destroyed = false

  constructor(
    private readonly container: HTMLElement,
    private readonly clock: PlaybackClock,
    config: DomDanmakuConfig = {},
    private readonly options: DomDanmakuRendererOptions = {},
  ) {
    this.config = config
    this.engine = new DanmakuEngineCore(clock, undefined, config)
    this.pool = new DanmakuNodePool(240, createDanmakuNode, resetNode)
    // 不透明度只作用于弹幕文字层，工具条作为同级节点保持清晰；
    // 容器级合成保留单条固定弹幕自身的淡入淡出动画。
    this.displayLayer = document.createElement('div')
    this.displayLayer.dataset.danmakuDisplayLayer = ''
    this.displayLayer.lang = DANMAKU_CONTENT_LANG
    this.displayLayer.style.position = 'absolute'
    this.displayLayer.style.inset = '0'
    this.displayLayer.style.pointerEvents = 'none'
    this.container.append(this.displayLayer)
    this.measurementLayer = createMeasurementLayer()
    this.container.append(this.measurementLayer)
    this.hoverToolbar = new DanmakuHoverToolbar(container, {
      // 复制与屏蔽都基于原文：显示的可能是译文，屏蔽规则只对原文生效
      onCopy: (id) => this.copyText(this.animations.get(id)?.originalText ?? ''),
      onBlock: (id) => {
        const text = this.animations.get(id)?.originalText
        // 规则生效后该弹幕会经 setBlockedIds 被撤掉，工具条随之隐藏
        if (text) this.options.onBlock?.(text)
      },
      onLeave: (id) => this.endHover(id),
    })
    this.applyOpacity(config.opacity)
    this.resizeSettler = new DanmakuResizeSettler((size) => this.settleResize(size))
    // 首次同步时还没有在屏弹幕，直接应用尺寸即可，不需要恢复。
    this.applySize({ width: container.clientWidth, height: container.clientHeight })
    this.lastRevision = this.engine.revision
    this.resizeObserver = new ResizeObserver(() => this.handleContainerResize())
    this.resizeObserver.observe(container)

    // Web 字体异步就绪后旧测量不再可信，按当前尺寸重建在屏弹幕，而不是清屏。
    void document.fonts?.ready.then(() => {
      if (this.destroyed) return
      this.invalidateMeasurements()
      this.resizeSettler.cancel()
      this.applySize({ width: this.container.clientWidth, height: this.container.clientHeight })
      this.relayout()
    })
  }

  replaceItems(items: ReadonlyArray<DanmakuItem>, currentTime: number): void {
    const recovering = this.cancelRecovery()
    this.clearNodes()
    this.engine.replaceItems(items, currentTime)
    if (recovering) this.restoreAfterSeek(currentTime)
    this.lastRevision = this.engine.revision
    this.refreshDiagnostics()
  }

  /**
   * 更新屏蔽集合：之后的候选由引擎跳过，已在屏的命中条目只撤掉它们自己，
   * 其余弹幕不清屏、不重排。换弹幕后需要重新调用。
   */
  setBlockedIds(ids: ReadonlySet<string>): void {
    const recovering = this.cancelRecovery()
    this.engine.setBlockedIds(ids)
    if (recovering) this.restoreAfterSeek(this.clock.now())
    if (ids.size === 0) return
    for (const id of [...this.animations.keys()]) {
      if (ids.has(id)) this.releaseNode(id)
    }
    this.refreshDiagnostics()
  }

  /**
   * 设置显示文本的来源（弹幕翻译用）。只影响之后出场的弹幕：
   * 在屏弹幕保持原样，也不触发清屏或重排。
   */
  setTextResolver(resolver: DanmakuTextResolver | null): void {
    this.resolveText = resolver ?? ((item) => item.text)
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

  /** 开始跳转时立即移除旧画面；最终落点由状态订阅调用 restoreAfterSeek。 */
  seek(time: number): void {
    if (this.destroyed || this.seekTarget === time) return
    this.cancelRecovery()
    this.seekTarget = time
    this.stopLoop()
    this.clearNodes()
    this.engine.seek(time)
    this.lastRevision = this.engine.revision
    this.refreshDiagnostics()
  }

  reset(): void {
    this.cancelRecovery()
    this.seekTarget = null
    this.pause()
    this.clearNodes()
    this.engine.seek(this.clock.now())
    this.lastRevision = this.engine.revision
    this.refreshDiagnostics()
  }

  restoreAfterSeek(time: number): void {
    this.restore(time, 'danmaku_seek_restore')
  }

  private restore(time: number, operation: RestoreOperation): void {
    if (this.destroyed) return
    // 尺寸仍在等待停稳时直接采用最新尺寸，避免先按旧布局恢复、停稳后再重排一次。
    const pendingSize = this.resizeSettler.take()
    if (pendingSize) this.applySize(pendingSize)
    this.seekTarget = null
    this.cancelRecovery()
    this.stopLoop()
    this.clearNodes()
    this.engine.seek(time)
    this.lastRevision = this.engine.revision
    const controller = new AbortController()
    this.recovery = controller
    void this.restoreSnapshot(time, controller, operation)
  }

  private cancelRecovery(): boolean {
    const recovering = this.recovery !== null
    this.recovery?.abort()
    this.recovery = null
    return recovering
  }

  private async restoreSnapshot(
    target: number,
    controller: AbortController,
    operation: RestoreOperation,
  ): Promise<void> {
    const { signal } = controller
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const { restoration, through } = await prepareSeekRestoration(
            this.engine,
            target,
            () => this.clock.now(),
            (items) => this.measureRestorationCandidates(items),
            signal,
          )
          signal.throwIfAborted()
          const at = this.clock.now()
          if (at < through || at - through > 0.25) throw new DanmakuRestoreBudgetError()
          // 此同步段内统一提交占用、游标、节点；下一帧之前不暴露半套快照。
          const placements = this.engine.installRestoration(restoration, through, at)
          if (!placements) throw new Error('弹幕恢复快照已失效')
          this.lastRevision = this.engine.revision
          for (const placement of placements) {
            const node = this.pool.acquire()
            if (!node) throw new Error('弹幕恢复节点容量不足')
            this.renderPlacement(node, placement, placement.elapsed)
          }
          this.refreshDiagnostics()
          return
        } catch (error) {
          if (signal.aborted) return
          if (error instanceof DanmakuRestoreBudgetError && attempt === 0) {
            target = this.clock.now()
            continue
          }
          throw error
        }
      }
    } catch (error) {
      if (signal.aborted) return
      this.clearNodes()
      this.engine.seek(this.clock.now())
      this.lastRevision = this.engine.revision
      this.refreshDiagnostics()
      reportOperationalError(
        'player',
        operation,
        Object.assign(new Error('弹幕跳转恢复失败，已回退至正常调度', { cause: error }), {
          code:
            error instanceof DanmakuRestoreBudgetError
              ? 'danmaku_restore_budget'
              : 'danmaku_restore_failed',
        }),
        true,
      )
    } finally {
      if (this.recovery === controller) {
        this.recovery = null
        // 恢复阶段测量过但没有上屏的候选不再需要
        this.displayTexts.clear()
        this.startLoop()
      }
    }
  }

  /** 历史测量只保留尺寸，每批最多 32 个节点，不占满活动池。 */
  private measureRestorationCandidates(items: ReadonlyArray<DanmakuItem>) {
    const pending: MeasuredCandidate[] = []
    try {
      for (const item of items) {
        const text = this.resolveText(item)
        this.displayTexts.set(item.id, text)
        const metrics = this.metricsCache.get(this.getMetricsKey(item, text)) ?? null
        const node = metrics ? null : this.pool.acquire()
        pending.push({ item, metrics, node })
        if (node) {
          prepareMeasureNode(node, item, text, this.config.fontSize ?? 26)
          this.measurementLayer.append(node)
        }
      }
      return pending.map(({ item, metrics, node }) => {
        if (metrics) return { item, metrics }
        if (!node) throw new Error('弹幕恢复测量节点不足')
        const text = this.displayTexts.get(item.id) ?? item.text
        const measured = normalizeMeasuredMetrics(
          node.getBoundingClientRect(),
          text,
          item.fontSize ?? this.config.fontSize ?? 26,
        )
        this.cacheMetrics(item, text, measured)
        return { item, metrics: measured }
      })
    } finally {
      for (const { node } of pending) if (node) this.releaseUnplacedNode(node)
    }
  }

  private cacheMetrics(item: DanmakuItem, text: string, metrics: DanmakuMetrics): void {
    // 长时间反复跳转也不能令测量缓存随全部弹幕无限增长。
    if (this.metricsCache.size >= 8192)
      this.metricsCache.delete(this.metricsCache.keys().next().value!)
    this.metricsCache.set(this.getMetricsKey(item, text), metrics)
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
    const layoutChanged =
      requiresReset ||
      durationChanged ||
      previous.fontSize !== next.fontSize ||
      previous.displayArea !== next.displayArea ||
      previous.maxOnScreen !== next.maxOnScreen
    const recovering = layoutChanged && this.cancelRecovery()
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
    if (recovering) this.restoreAfterSeek(this.clock.now())
    this.refreshDiagnostics()
  }

  setExclusionRect(rect: DanmakuRect | null): void {
    // 控制器位置连续变化只更新约束；已有弹幕继续运动，不清空占用。
    if (sameExclusionRect(this.exclusionRect, rect)) return
    this.exclusionRect = rect
    const recovering = this.cancelRecovery()
    this.engine.setExclusionRect(rect)
    if (recovering) this.restoreAfterSeek(this.clock.now())
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
    this.cancelRecovery()
    this.stopLoop()
    this.resizeSettler.cancel()
    this.resizeObserver.disconnect()
    this.clearNodes()
    this.hoverToolbar.dispose()
    this.measurementLayer.remove()
    this.displayLayer.remove()
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
    if (
      this.frameId !== null ||
      !this.playing ||
      this.destroyed ||
      this.recovery ||
      this.seekTarget !== null ||
      // 尺寸待定期间不发射新弹幕：按旧布局分配的轨道停稳后会被整体重排
      this.resizeSettler.isPending
    )
      return
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
    // 没排上轨道的候选不会上屏，丢掉为它们记下的显示文本
    this.displayTexts.clear()
  }

  /** 先统一写 DOM，再集中读布局，避免逐条读写交错造成 layout thrashing。 */
  private measureCandidates(items: ReadonlyArray<DanmakuItem>): MeasuredCandidate[] {
    const candidates = items.map<MeasuredCandidate>((item) => {
      const node = this.pool.acquire()
      if (!node) return { item, metrics: null, node: null }
      const text = this.resolveText(item)
      this.displayTexts.set(item.id, text)
      prepareMeasureNode(node, item, text, this.config.fontSize ?? 26)
      this.measurementLayer.append(node)
      return { item, metrics: this.metricsCache.get(this.getMetricsKey(item, text)) ?? null, node }
    })

    for (const candidate of candidates) {
      if (!candidate.node || candidate.metrics) continue
      const rect = candidate.node.getBoundingClientRect()
      const fontSize = candidate.item.fontSize ?? this.config.fontSize ?? 26
      const text = this.displayTexts.get(candidate.item.id) ?? candidate.item.text
      const metrics = normalizeMeasuredMetrics(rect, text, fontSize)
      this.cacheMetrics(candidate.item, text, metrics)
      candidate.metrics = metrics
    }
    return candidates
  }

  private renderPlacement(
    node: HTMLSpanElement,
    placement: DanmakuPlacement,
    elapsed?: number,
  ): void {
    let animation: Animation | undefined
    // 与测量时使用的文本保持一致；没有记录时（不应发生）退回当前解析结果
    const displayText = this.displayTexts.get(placement.item.id) ?? this.resolveText(placement.item)
    try {
      prepareNode(
        node,
        placement,
        displayText,
        this.container.clientWidth,
        Boolean(this.config.hoverPause),
        this.config.fontSize ?? 26,
      )
      this.displayLayer.append(node)
      animation = createAnimation(node, placement, this.container.clientWidth)
      animation.playbackRate = placement.playbackRate
      if (elapsed !== undefined) {
        animation.pause()
        animation.currentTime = elapsed * 1000
        if (this.playing) animation.play()
      }
      node.style.visibility = 'visible'
      const active: ActiveAnimation = {
        node,
        animation,
        duration: placement.duration,
        originalText: placement.item.text,
        displayText,
      }
      this.animations.set(placement.item.id, active)
      this.bindHoverBehavior(placement.item.id, active)

      void animation.finished.then(
        () => {
          if (this.animations.get(placement.item.id) === active)
            this.releaseNode(placement.item.id, true)
        },
        () => {},
      )
    } catch (error) {
      animation?.cancel()
      if (this.animations.has(placement.item.id)) this.releaseNode(placement.item.id)
      else this.releaseUnplacedNode(node)
      throw error
    }
  }

  private releaseNode(id: string, completed = false): void {
    const active = this.animations.get(id)
    if (!active) return
    this.animations.delete(id)
    this.hoverPaused.delete(id)
    this.hoverToolbar.release(id)
    if (completed) this.engine.completeItem(id)
    else this.engine.cancelItem(id)
    active.animation.cancel()
    active.node.remove()
    this.pool.release(active.node)
  }

  private bindHoverBehavior(id: string, active: ActiveAnimation): void {
    active.node.style.setProperty('-webkit-app-region', 'no-drag')
    active.node.style.pointerEvents = 'auto'
    if (!this.config.hoverPause && this.hoverPaused.delete(id)) {
      this.engine.resumeItem(id)
      if (this.playing) active.animation.play()
    }
    active.node.onmouseenter = (event) => {
      if (!this.config.hoverPause) return
      // 从工具条回到文字上时这条弹幕仍处于暂停，不重复暂停
      if (!this.hoverPaused.has(id)) {
        this.engine.pauseItem(id)
        this.hoverPaused.add(id)
        active.animation.pause()
      }
      // 显示的是译文时，工具条里附带原文
      this.hoverToolbar.attach(
        id,
        active.node,
        event.clientX,
        active.displayText === active.originalText ? null : active.originalText,
      )
    }
    // 工具条出现在鼠标正下方：驻留期间持续记录鼠标位置
    active.node.onmousemove = (event) => this.hoverToolbar.track(id, event.clientX)
    active.node.onmouseleave = (event) => {
      // 工具条属于悬停区域：鼠标从文字移到工具条上时保持暂停
      if (this.hoverToolbar.contains(event.relatedTarget)) return
      this.endHover(id)
    }
    // 复制与屏蔽都在悬停工具条上完成，文字本身不响应点击；
    // 只拦截冒泡，保证单击、双击文字不会触发播放器的任何手势。
    active.node.ondblclick = (event) => event.stopPropagation()
    active.node.onclick = (event) => event.stopPropagation()
  }

  /** 结束一条弹幕的悬停：收起工具条并恢复运动 */
  private endHover(id: string): void {
    this.hoverToolbar.release(id)
    if (!this.hoverPaused.delete(id)) return
    this.engine.resumeItem(id)
    const active = this.animations.get(id)
    if (active && this.playing) active.animation.play()
  }

  private copyText(text: string): void {
    void (navigator.clipboard?.writeText(text) ?? Promise.reject(new Error('剪贴板不可用'))).then(
      () => {
        captureFeatureUsed('danmaku_copy', 'success')
        if (!this.destroyed) toast({ title: t('danmaku:hover.copied'), duration: 1500 })
      },
      () => {
        if (!this.destroyed) {
          captureFeatureUsed('danmaku_copy', 'failed')
          toast({
            title: t('danmaku:hover.copyFailed'),
            variant: 'destructive',
            duration: 3000,
          })
        }
      },
    )
  }

  private releaseUnplacedNode(node: HTMLSpanElement): void {
    node.remove()
    this.pool.release(node)
  }

  private clearNodes(): void {
    for (const id of [...this.animations.keys()]) this.releaseNode(id)
    this.hoverToolbar.hide()
    this.pool.releaseAll()
    this.displayTexts.clear()
  }

  /**
   * 拖动窗口、最大化、进出全屏时容器尺寸变化：旧弹幕沿原动画继续运动，暂停发射新弹幕，
   * 等尺寸停稳后再按新宽高从当前时刻恢复在屏弹幕，而不是直接清屏。
   */
  private handleContainerResize(): void {
    if (this.destroyed) return
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    if (width === this.lastWidth && height === this.lastHeight) {
      // 拖回到已应用的尺寸：现有布局仍然有效，放弃待定并恢复发射
      if (this.resizeSettler.cancel()) this.startLoop()
      return
    }
    this.stopLoop()
    this.resizeSettler.schedule({ width, height })
  }

  private settleResize(size: DanmakuStageSize): void {
    if (this.destroyed) return
    this.applySize(size)
    this.relayout()
  }

  private applySize({ width, height }: DanmakuStageSize): void {
    this.lastWidth = width
    this.lastHeight = height
    this.engine.resize(width, height)
  }

  /** 布局整体失效后按当前时刻重建在屏弹幕；seek 进行中则只清屏，由落点负责恢复。 */
  private relayout(): void {
    if (this.seekTarget !== null) {
      this.cancelRecovery()
      this.clearNodes()
      this.lastRevision = this.engine.revision
      this.refreshDiagnostics()
      return
    }
    this.restore(this.clock.now(), 'danmaku_resize_restore')
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
    this.displayLayer.style.opacity = String(clamp(opacity ?? 1, 0, 1))
  }

  /** 宽度取决于实际显示的文本，译文与原文各自缓存 */
  private getMetricsKey(item: DanmakuItem, text: string) {
    return `${this.styleRevision}:${item.fontSize ?? this.config.fontSize ?? 26}:${text}`
  }

  private refreshDiagnostics(): void {
    const diagnostics = this.engine.getDiagnostics()
    this.container.dataset.danmakuActive = String(diagnostics.active)
    this.container.dataset.danmakuPeakActive = String(diagnostics.peakActive)
    this.container.dataset.danmakuDropped = String(diagnostics.dropped)
  }
}

/**
 * 弹幕内容的语言标注，与其他外部中文内容共用同一个常量（说明见 CONTENT_LANG）。
 * 英文译文也落在这个标注下，渲染与全页都是 `lang="zh-CN"` 时相同。
 */
const DANMAKU_CONTENT_LANG = CONTENT_LANG

const createMeasurementLayer = () => {
  const layer = document.createElement('div')
  layer.dataset.danmakuMeasurementLayer = ''
  // 必须与显示层的语言标注一致，否则测得的宽度与上屏时不同
  layer.lang = DANMAKU_CONTENT_LANG
  layer.style.position = 'absolute'
  layer.style.inset = '0'
  layer.style.visibility = 'hidden'
  layer.style.pointerEvents = 'none'
  layer.style.overflow = 'hidden'
  layer.style.contain = 'layout style paint'
  return layer
}

const createDanmakuNode = () => document.createElement('span')

const applyTextStyle = (
  node: HTMLSpanElement,
  item: DanmakuItem,
  text: string,
  defaultFontSize: number,
) => {
  node.setAttribute('aria-hidden', 'true')
  node.textContent = text
  node.className = 'absolute top-0 left-0 whitespace-nowrap font-semibold will-change-transform'
  node.style.color = item.color
  node.style.fontSize = `${item.fontSize ?? defaultFontSize}px`
  node.style.lineHeight = '1.35'
  node.style.textShadow = '0 1px 2px rgb(0 0 0 / 90%), 1px 0 1px rgb(0 0 0 / 70%)'
}

const prepareMeasureNode = (
  node: HTMLSpanElement,
  item: DanmakuItem,
  text: string,
  defaultFontSize: number,
) => {
  applyTextStyle(node, item, text, defaultFontSize)
  node.style.position = 'absolute'
  node.style.width = 'max-content'
  node.style.transform = 'none'
  node.style.visibility = 'hidden'
  node.style.pointerEvents = 'none'
}

const prepareNode = (
  node: HTMLSpanElement,
  placement: DanmakuPlacement,
  text: string,
  viewportWidth: number,
  hoverPause: boolean,
  defaultFontSize: number,
) => {
  node.dataset.danmakuNode = placement.item.id
  node.dataset.danmakuMode = placement.item.mode
  node.dataset.danmakuLane = String(placement.lane)
  applyTextStyle(node, placement.item, text, defaultFontSize)
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
  node.onmousemove = null
  node.onclick = null
  node.ondblclick = null
  node.textContent = ''
  node.className = ''
  node.removeAttribute('style')
  for (const key of Object.keys(node.dataset)) delete node.dataset[key]
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value))

const sameExclusionRect = (left: DanmakuRect | null, right: DanmakuRect | null) =>
  left === right ||
  Boolean(
    left &&
    right &&
    left.left === right.left &&
    left.right === right.right &&
    left.top === right.top &&
    left.bottom === right.bottom,
  )
