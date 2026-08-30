import type {
  DanmakuConfig,
  DanmakuItem,
  DanmakuLayout,
  DanmakuMetrics,
  DanmakuMotionSnapshot,
  DanmakuRect,
} from './types'

interface ActiveDanmaku {
  item: DanmakuItem
  metrics: DanmakuMetrics
  lane: number
  laneSpan: number
  enteredAt: number
  duration: number
  pausedAt: number | null
  pausedDuration: number
}

export interface LaneAllocation {
  lane: number
  laneSpan: number
  y: number
}

/** 统一维护所有模式的垂直占用与运动状态。 */
export class DanmakuLaneAllocator {
  private layout: DanmakuLayout = { width: 0, height: 0 }
  private active = new Map<string, ActiveDanmaku>()
  private readonly laneHeight: number

  constructor(private config: DanmakuConfig) {
    // 虚拟轨道是稳定的空间量化单位；字号变化由真实高度跨轨表达，不重排旧节点。
    this.laneHeight = Math.max(1, config.fontSize * 1.35)
  }

  updateConfig(config: DanmakuConfig, reset = true): void {
    this.config = config
    if (reset) this.reset()
  }

  /** 保留每条活动弹幕的归一化进度，将后续运动平滑切换到新的持续时间。 */
  rebaseDuration(duration: number, at: number): void {
    if (!Number.isFinite(duration) || duration <= 0) return
    for (const record of this.active.values()) {
      if (at < record.enteredAt) {
        record.duration = duration
        continue
      }
      const effectiveAt = record.pausedAt ?? at
      const progress = clamp(this.getElapsed(record, at) / record.duration, 0, 1)
      record.duration = duration
      record.enteredAt = effectiveAt - progress * duration - record.pausedDuration
    }
  }

  resize(layout: DanmakuLayout): void {
    this.layout = layout
    this.reset()
  }

  updateExclusionRect(rect: DanmakuRect | null): boolean {
    const previous = this.layout.exclusionRect ?? null
    if (sameRect(previous, rect)) return false
    this.layout = { ...this.layout, exclusionRect: rect }
    return true
  }

  reset(): void {
    this.active.clear()
  }

  allocate(item: DanmakuItem, metrics: DanmakuMetrics, at: number): LaneAllocation | null {
    this.prune(at)
    if (this.getLaneCount() === 0 || this.active.has(item.id)) return null

    const safeMetrics = normalizeMetrics(metrics, this.getLaneHeight())
    const laneSpan = Math.max(1, Math.ceil(safeMetrics.height / this.getLaneHeight()))
    if (laneSpan > this.getLaneCount()) return null

    for (const lane of this.getCandidateLanes(item.mode, laneSpan)) {
      const allocation = { lane, laneSpan, y: lane * this.getLaneHeight() }
      if (!this.isAllocationSafe(item, safeMetrics, allocation, at)) continue
      this.active.set(item.id, {
        item,
        metrics: safeMetrics,
        lane,
        laneSpan,
        enteredAt: at,
        duration: this.config.duration,
        pausedAt: null,
        pausedDuration: 0,
      })
      return allocation
    }
    return null
  }

  pause(id: string, at: number): boolean {
    const record = this.active.get(id)
    if (!record || record.pausedAt !== null) return false
    record.pausedAt = Math.max(record.enteredAt, at)
    return true
  }

  resume(id: string, at: number): boolean {
    const record = this.active.get(id)
    if (!record || record.pausedAt === null) return false
    record.pausedDuration += Math.max(0, at - record.pausedAt)
    record.pausedAt = null
    return true
  }

  complete(id: string): boolean {
    return this.active.delete(id)
  }

  prune(at: number): string[] {
    const completed: string[] = []
    for (const record of this.active.values()) {
      if (record.pausedAt !== null || this.getElapsed(record, at) < record.duration) continue
      this.active.delete(record.item.id)
      completed.push(record.item.id)
    }
    return completed
  }

  getMotionSnapshot(id: string, at: number): DanmakuMotionSnapshot | null {
    const record = this.active.get(id)
    if (!record) return null
    const elapsed = this.getElapsed(record, at)
    const horizontal = this.getHorizontalRect(record, elapsed)
    return {
      id,
      mode: record.item.mode,
      state: record.pausedAt !== null ? 'paused' : at < record.enteredAt ? 'pending' : 'running',
      lane: record.lane,
      laneSpan: record.laneSpan,
      elapsed,
      ...horizontal,
      top: record.lane * this.getLaneHeight(),
      bottom: record.lane * this.getLaneHeight() + record.metrics.height,
    }
  }

  get activeCount() {
    return this.active.size
  }

  private isAllocationSafe(
    item: DanmakuItem,
    metrics: DanmakuMetrics,
    allocation: LaneAllocation,
    at: number,
  ): boolean {
    const top = allocation.y
    const bottom = top + metrics.height
    if (intersectsVertical(top, bottom, this.layout.exclusionRect)) return false

    for (const existing of this.active.values()) {
      if (!spansOverlap(allocation.lane, allocation.laneSpan, existing.lane, existing.laneSpan)) {
        continue
      }
      if (item.mode !== 'scroll' || existing.item.mode !== 'scroll') return false
      if (!this.isScrollSafe(existing, metrics, at)) return false
    }
    return true
  }

  private isScrollSafe(previous: ActiveDanmaku, next: DanmakuMetrics, at: number): boolean {
    if (previous.pausedAt !== null) return false
    const elapsed = this.getElapsed(previous, at)
    const previousSpeed = (this.layout.width + previous.metrics.width) / previous.duration
    const previousRight = this.layout.width + previous.metrics.width - previousSpeed * elapsed
    if (previousRight <= 0) return true

    const initialGap = this.layout.width - previousRight
    if (initialGap + COLLISION_EPSILON < this.config.laneGap) return false

    const nextSpeed = (this.layout.width + next.width) / this.config.duration
    if (nextSpeed <= previousSpeed) return true

    const timeUntilMinimumGap = (initialGap - this.config.laneGap) / (nextSpeed - previousSpeed)
    const previousRemaining = previousRight / previousSpeed
    return timeUntilMinimumGap + COLLISION_EPSILON >= previousRemaining
  }

  private getHorizontalRect(record: ActiveDanmaku, elapsed: number) {
    if (record.item.mode !== 'scroll') {
      const left = Math.max(0, (this.layout.width - record.metrics.width) / 2)
      return { left, right: left + record.metrics.width }
    }
    const speed = (this.layout.width + record.metrics.width) / record.duration
    const left = this.layout.width - speed * elapsed
    return { left, right: left + record.metrics.width }
  }

  private getElapsed(record: ActiveDanmaku, at: number) {
    const effectiveAt = record.pausedAt ?? at
    return Math.max(0, effectiveAt - record.enteredAt - record.pausedDuration)
  }

  private getCandidateLanes(mode: DanmakuItem['mode'], laneSpan: number) {
    const maximumStart = this.getLaneCount() - laneSpan
    const lanes = Array.from({ length: maximumStart + 1 }, (_, index) => index)
    return mode === 'bottom' ? lanes.reverse() : lanes
  }

  private getVisibleHeight() {
    return Math.max(0, this.layout.height * clamp(this.config.displayArea, 0, 1))
  }

  private getLaneHeight() {
    return this.laneHeight
  }

  private getLaneCount() {
    return Math.floor(this.getVisibleHeight() / this.getLaneHeight())
  }
}

const COLLISION_EPSILON = 0.001

const normalizeMetrics = (metrics: DanmakuMetrics, fallbackHeight: number): DanmakuMetrics => ({
  width: Math.max(1, Number.isFinite(metrics.width) ? metrics.width : 1),
  height: Math.max(1, Number.isFinite(metrics.height) ? metrics.height : fallbackHeight),
})

const spansOverlap = (first: number, firstSpan: number, second: number, secondSpan: number) =>
  first < second + secondSpan && first + firstSpan > second

const intersectsVertical = (top: number, bottom: number, rect?: DanmakuRect | null) =>
  Boolean(rect && top < rect.bottom && bottom > rect.top)

const sameRect = (left: DanmakuRect | null, right: DanmakuRect | null) =>
  left === right ||
  Boolean(
    left &&
    right &&
    left.left === right.left &&
    left.top === right.top &&
    left.right === right.right &&
    left.bottom === right.bottom,
  )

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum)
