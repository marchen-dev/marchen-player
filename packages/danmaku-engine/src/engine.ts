import type {
  DanmakuClock,
  DanmakuConfig,
  DanmakuDiagnostics,
  DanmakuItem,
  DanmakuLayout,
  DanmakuMeasuredItem,
  DanmakuMetrics,
  DanmakuMotionSnapshot,
  DanmakuPlacement,
  DanmakuRect,
} from './types'
import { DanmakuLaneAllocator } from './lanes'
import { DanmakuTimeline } from './timeline'
import { DEFAULT_DANMAKU_CONFIG } from './types'

export class DanmakuEngineCore {
  private config: DanmakuConfig
  private readonly timeline = new DanmakuTimeline()
  private readonly allocator: DanmakuLaneAllocator
  private playing = false
  private playbackRate = 1
  private layout: DanmakuLayout = { width: 0, height: 0 }
  private resetRevision = 0
  private peakActive = 0
  private dropped = 0
  /**
   * 不应出现的弹幕 id。引擎只认集合，不关心它由什么规则得出。
   * 换弹幕（replaceItems）不会清空它：新旧 id 空间不同，由调用方在替换后重新下发。
   */
  private blockedIds: ReadonlySet<string> = new Set()

  constructor(
    private readonly clock: DanmakuClock,
    private readonly measure?: (item: DanmakuItem) => DanmakuMetrics,
    config: Partial<DanmakuConfig> = {},
  ) {
    this.config = { ...DEFAULT_DANMAKU_CONFIG, ...config }
    this.allocator = new DanmakuLaneAllocator(this.config)
  }

  replaceItems(items: ReadonlyArray<DanmakuItem>, currentTime = this.clock.now()): void {
    this.clearActive()
    this.peakActive = 0
    this.dropped = 0
    this.timeline.replace(items, currentTime)
  }

  play(): void {
    this.playing = true
  }

  pause(): void {
    this.playing = false
  }

  seek(time: number): void {
    this.clearActive()
    this.timeline.seek(time)
  }

  setRate(rate: number): void {
    this.playbackRate = Number.isFinite(rate) && rate > 0 ? rate : 1
  }

  /**
   * 更新屏蔽集合。只影响之后的候选，不动时间线、不递增 revision，
   * 在屏弹幕保持原位；已在屏且新被屏蔽的条目由渲染层按 id 调用 cancelItem 撤掉。
   */
  setBlockedIds(ids: ReadonlySet<string>): void {
    this.blockedIds = ids
  }

  pauseItem(id: string): boolean {
    return this.allocator.pause(id, this.clock.now())
  }

  resumeItem(id: string): boolean {
    return this.allocator.resume(id, this.clock.now())
  }

  completeItem(id: string): boolean {
    return this.allocator.complete(id)
  }

  cancelItem(id: string): boolean {
    return this.completeItem(id)
  }

  getMotionSnapshot(id: string, at = this.clock.now()): DanmakuMotionSnapshot | null {
    return this.allocator.getMotionSnapshot(id, at)
  }

  getDiagnostics(): DanmakuDiagnostics {
    return { active: this.activeCount, peakActive: this.peakActive, dropped: this.dropped }
  }

  updateConfig(config: Partial<DanmakuConfig>, reset = true): void {
    const next = { ...this.config, ...config }
    if (!reset && next.duration !== this.config.duration) {
      this.allocator.rebaseDuration(next.duration, this.clock.now())
    }
    this.config = next
    this.allocator.updateConfig(this.config, reset)
    if (reset) this.resetRevision += 1
  }

  resize(width: number, height: number): void {
    this.layout = { ...this.layout, width: Math.max(0, width), height: Math.max(0, height) }
    this.clearActive()
  }

  setExclusionRect(rect: DanmakuRect | null): void {
    this.layout = { ...this.layout, exclusionRect: rect }
    this.allocator.updateExclusionRect(rect)
  }

  tick(): DanmakuPlacement[] {
    const candidates = this.collectCandidates()
    return this.placeCandidates(
      candidates.map((item) => ({ item, metrics: this.measure?.(item) ?? null })),
    )
  }

  collectCandidates(): DanmakuItem[] {
    if (!this.playing || !this.config.enabled) return []
    const now = this.clock.now()
    this.allocator.prune(now)
    const items = this.timeline.collect(now, this.config.lookAhead)
    // 在候选出口跳过：被屏蔽的弹幕不进入测量与放置，也就不占同屏数量名额，且不计入丢弃统计
    if (this.blockedIds.size === 0) return items
    return items.filter((item) => !this.blockedIds.has(item.id))
  }

  placeCandidates(candidates: ReadonlyArray<DanmakuMeasuredItem>): DanmakuPlacement[] {
    if (!this.playing || !this.config.enabled) return []
    const now = this.clock.now()
    this.allocator.prune(now)
    const placements: DanmakuPlacement[] = []
    for (const { item, metrics } of candidates) {
      if (this.activeCount >= this.config.maxOnScreen) {
        this.dropped += 1
        continue
      }
      if (!metrics) {
        this.dropped += 1
        continue
      }
      // 迟到帧从此刻开始显示，轨道占用也必须从此刻算，不能沿用已过去的起点。
      const allocation = this.allocator.allocate(item, metrics, Math.max(now, item.time))
      if (!allocation) {
        this.dropped += 1
        continue
      }
      this.peakActive = Math.max(this.peakActive, this.activeCount)
      placements.push({
        item,
        ...allocation,
        ...metrics,
        duration: this.config.duration,
        playbackRate: this.playbackRate,
        startDelay: Math.max(0, item.time - now),
      })
    }
    return placements
  }

  get revision() {
    return this.resetRevision
  }

  get activeCount() {
    return this.allocator.activeCount
  }

  private clearActive(): void {
    this.allocator.resize(this.layout)
    this.resetRevision += 1
  }
}
