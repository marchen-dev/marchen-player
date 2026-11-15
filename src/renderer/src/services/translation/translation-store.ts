/**
 * 译文表：归一化后的原文 → 译文。
 *
 * 只存在于内存，不持久化；切换视频不清空，重复出现的弹幕可以跨集复用。
 * 渲染器在每条弹幕出场时同步查表，因此读取必须是普通的 Map 查找。
 */

/** 与繁转简缓存相同的量级；超出后整体清空，弹幕按集切换，旧条目复用价值低，无需 LRU */
const MAX_ENTRIES = 20_000

export class TranslationStore {
  private readonly entries = new Map<string, string>()
  private readonly listeners = new Set<() => void>()
  private revision = 0

  get(key: string): string | undefined {
    return this.entries.get(key)
  }

  get size(): number {
    return this.entries.size
  }

  /** 每次内容变化递增，供 React 的 useSyncExternalStore 判断是否需要刷新 */
  get version(): number {
    return this.revision
  }

  /** 一批译文一起写入，只通知一次 */
  setMany(pairs: Iterable<readonly [key: string, value: string]>): void {
    let changed = false
    for (const [key, value] of pairs) {
      if (!value || this.entries.get(key) === value) continue
      if (this.entries.size >= MAX_ENTRIES && !this.entries.has(key)) this.entries.clear()
      this.entries.set(key, value)
      changed = true
    }
    if (changed) this.notify()
  }

  clear(): void {
    if (this.entries.size === 0) return
    this.entries.clear()
    this.notify()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    this.revision += 1
    for (const listener of this.listeners) listener()
  }
}

/** 全应用共用一份译文表：渲染器、弹幕列表与调度器读写的是同一份数据 */
export const translationStore = new TranslationStore()
