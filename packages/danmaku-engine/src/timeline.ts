import type { DanmakuItem } from './types'

export const lowerBoundByTime = (items: ReadonlyArray<DanmakuItem>, time: number) => {
  let low = 0
  let high = items.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (items[middle]!.time < time) low = middle + 1
    else high = middle
  }
  return low
}

export class DanmakuTimeline {
  private items: ReadonlyArray<DanmakuItem> = []
  private index = 0

  replace(items: ReadonlyArray<DanmakuItem>, currentTime: number): void {
    this.items = [...items].sort((left, right) => left.time - right.time)
    this.seek(currentTime)
  }

  seek(currentTime: number): void {
    this.index = lowerBoundByTime(this.items, Math.max(0, currentTime))
  }

  collect(currentTime: number, lookAhead: number): DanmakuItem[] {
    const result: DanmakuItem[] = []
    const endTime = Math.max(0, currentTime) + Math.max(0, lookAhead)
    while (this.index < this.items.length && this.items[this.index]!.time <= endTime) {
      result.push(this.items[this.index]!)
      this.index += 1
    }
    return result
  }
}
