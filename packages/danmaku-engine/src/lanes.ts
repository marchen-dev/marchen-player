import type { DanmakuConfig, DanmakuItem, DanmakuLayout, DanmakuRect } from './types'

interface ScrollingLaneState {
  enteredAt: number
  width: number
  duration: number
}

export interface LaneAllocation {
  lane: number
  y: number
}

export class DanmakuLaneAllocator {
  private layout: DanmakuLayout = { width: 0, height: 0 }
  private scrollLanes: Array<ScrollingLaneState | null> = []
  private topLanes: number[] = []
  private bottomLanes: number[] = []

  constructor(private config: DanmakuConfig) {}

  updateConfig(config: DanmakuConfig): void {
    this.config = config
    this.reset()
  }

  resize(layout: DanmakuLayout): void {
    this.layout = layout
    this.reset()
  }

  reset(): void {
    const laneCount = this.getLaneCount()
    this.scrollLanes = Array.from({ length: laneCount }).fill(
      null,
    ) as Array<ScrollingLaneState | null>
    this.topLanes = Array.from({ length: laneCount }).fill(0) as number[]
    this.bottomLanes = Array.from({ length: laneCount }).fill(0) as number[]
  }

  allocate(item: DanmakuItem, width: number, at: number): LaneAllocation | null {
    if (this.getLaneCount() === 0) return null
    if (item.mode === 'scroll') return this.allocateScroll(width, at)
    return this.allocateFixed(item.mode, at)
  }

  private allocateScroll(width: number, at: number): LaneAllocation | null {
    for (let lane = 0; lane < this.scrollLanes.length; lane += 1) {
      const previous = this.scrollLanes[lane]
      if (previous && !this.isScrollSafe(previous, width, at)) continue
      this.scrollLanes[lane] = { enteredAt: at, width, duration: this.config.duration }
      return { lane, y: lane * this.getLaneHeight() }
    }
    return null
  }

  private isScrollSafe(previous: ScrollingLaneState, nextWidth: number, at: number): boolean {
    const viewportWidth = this.layout.width
    const elapsed = Math.max(0, at - previous.enteredAt)
    const previousSpeed = (viewportWidth + previous.width) / previous.duration
    const previousRight = viewportWidth + previous.width - previousSpeed * elapsed
    if (previousRight <= 0) return true
    if (previousRight > viewportWidth - this.config.laneGap) return false

    const nextSpeed = (viewportWidth + nextWidth) / this.config.duration
    if (nextSpeed <= previousSpeed) return true
    const catchTime = (viewportWidth - previousRight) / (nextSpeed - previousSpeed)
    const previousRemaining = previousRight / previousSpeed
    return catchTime >= previousRemaining
  }

  private allocateFixed(mode: 'top' | 'bottom', at: number): LaneAllocation | null {
    const lanes = mode === 'top' ? this.topLanes : this.bottomLanes
    for (let lane = 0; lane < lanes.length; lane += 1) {
      if (lanes[lane]! > at) continue
      const y =
        mode === 'top'
          ? lane * this.getLaneHeight()
          : this.getVisibleHeight() - (lane + 1) * this.getLaneHeight()
      if (intersectsLane(y, this.getLaneHeight(), this.layout.exclusionRect)) continue
      lanes[lane] = at + this.config.duration
      return { lane, y }
    }
    return null
  }

  private getVisibleHeight() {
    return Math.max(0, this.layout.height * clamp(this.config.displayArea, 0, 1))
  }

  private getLaneHeight() {
    return Math.max(1, this.config.fontSize * 1.35)
  }

  private getLaneCount() {
    return Math.floor(this.getVisibleHeight() / this.getLaneHeight())
  }
}

const intersectsLane = (top: number, height: number, rect?: DanmakuRect | null) =>
  Boolean(rect && top < rect.bottom && top + height > rect.top)

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum)
