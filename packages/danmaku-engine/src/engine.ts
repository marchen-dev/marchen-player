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
    return this.timeline.collect(now, this.config.lookAhead)
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
      const allocation = this.allocator.allocate(item, metrics, item.time)
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
