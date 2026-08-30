import type {
  DanmakuClock,
  DanmakuConfig,
  DanmakuItem,
  DanmakuLayout,
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
  private active = new Map<string, number>()
  private playing = false
  private playbackRate = 1
  private layout: DanmakuLayout = { width: 0, height: 0 }
  private resetRevision = 0

  constructor(
    private readonly clock: DanmakuClock,
    private readonly measure: (item: DanmakuItem) => number,
    config: Partial<DanmakuConfig> = {},
  ) {
    this.config = { ...DEFAULT_DANMAKU_CONFIG, ...config }
    this.allocator = new DanmakuLaneAllocator(this.config)
  }

  replaceItems(items: ReadonlyArray<DanmakuItem>, currentTime = this.clock.now()): void {
    this.clearActive()
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

  updateConfig(config: Partial<DanmakuConfig>): void {
    this.config = { ...this.config, ...config }
    this.allocator.updateConfig(this.config)
    this.clearActive()
  }

  resize(width: number, height: number): void {
    this.layout = { ...this.layout, width: Math.max(0, width), height: Math.max(0, height) }
    this.allocator.resize(this.layout)
    this.clearActive()
  }

  setExclusionRect(rect: DanmakuRect | null): void {
    this.layout = { ...this.layout, exclusionRect: rect }
    this.allocator.resize(this.layout)
  }

  tick(): DanmakuPlacement[] {
    if (!this.playing || !this.config.enabled) return []
    const now = this.clock.now()
    for (const [id, expiresAt] of this.active) {
      if (expiresAt <= now) this.active.delete(id)
    }

    const placements: DanmakuPlacement[] = []
    for (const item of this.timeline.collect(now, this.config.lookAhead)) {
      if (this.active.size >= this.config.maxOnScreen) break
      const width = Math.max(1, this.measure(item))
      const allocation = this.allocator.allocate(item, width, item.time)
      if (!allocation) continue
      this.active.set(item.id, item.time + this.config.duration)
      placements.push({
        item,
        ...allocation,
        width,
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
    return this.active.size
  }

  private clearActive(): void {
    this.active.clear()
    this.allocator.resize(this.layout)
    this.resetRevision += 1
  }
}
