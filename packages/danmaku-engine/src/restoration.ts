import type { DanmakuLaneAllocator } from './lanes'
import type { DanmakuConfig, DanmakuMeasuredItem, DanmakuPlacement } from './types'

export interface RestoredDanmakuPlacement extends DanmakuPlacement {
  elapsed: number
}

/** 分批消费已测量条目，模拟时间独立于播放器时钟与 playing 状态。 */
export class DanmakuRestoration {
  private readonly placements = new Map<string, DanmakuPlacement>()
  private at = -Infinity
  private consumed = false
  private dropped = 0
  private peak = 0

  constructor(
    private readonly owner: symbol,
    private readonly version: number,
    private readonly allocator: DanmakuLaneAllocator,
    readonly config: Readonly<DanmakuConfig>,
    private readonly blockedIds: ReadonlySet<string>,
  ) {}

  append(candidates: ReadonlyArray<DanmakuMeasuredItem>): void {
    if (this.consumed) throw new Error('弹幕恢复快照已提交')
    for (const { item, metrics } of candidates) {
      if (item.time < this.at) throw new Error('弹幕恢复条目必须按时间递增')
      this.advance(item.time)
      if (!this.config.enabled || this.blockedIds.has(item.id)) continue
      if (!metrics || this.allocator.activeCount >= this.config.maxOnScreen) {
        this.dropped += 1
        continue
      }
      const allocation = this.allocator.allocate(item, metrics, item.time)
      if (!allocation) {
        this.dropped += 1
        continue
      }
      this.placements.set(item.id, {
        item,
        ...allocation,
        ...metrics,
        duration: this.config.duration,
        startDelay: 0,
        playbackRate: 1,
      })
      this.peak = Math.max(this.peak, this.allocator.activeCount)
    }
  }

  advance(time: number): void {
    if (time < this.at) throw new Error('弹幕恢复时间不能倒退')
    this.at = time
    for (const id of this.allocator.prune(time)) this.placements.delete(id)
  }

  /** 最后推进至展示时钟，但普通游标只推进到确实消费完的时间。 */
  take(owner: symbol, version: number, time: number, rate: number) {
    if (this.consumed || owner !== this.owner || version !== this.version) return null
    this.advance(time)
    this.consumed = true
    const placements: RestoredDanmakuPlacement[] = [...this.placements.values()].map(
      (placement) => ({
        ...placement,
        playbackRate: rate,
        elapsed: time - placement.item.time,
      }),
    )
    return { allocator: this.allocator, placements, dropped: this.dropped, peak: this.peak }
  }
}
