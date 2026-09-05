import { rm } from 'node:fs/promises'
import { SegmentStore } from './segment-store'

export interface SegmentBackWindowCleanerOptions {
  store: SegmentStore
  /** 只能由真实反向 seek 再生验收结果开启，不得根据代码路径自动猜测。 */
  reverseRegenerationValidated: boolean
  backWindowSeconds?: number
  removeFile?: (path: string) => Promise<void>
}

export interface SegmentBackWindowCleanupResult {
  removedIndices: number[]
  removedBytes: number
}

/** 清理逻辑只依赖最近消费位置，并由 SegmentStore 的引用计数决定资源是否可移交。 */
export class SegmentBackWindowCleaner {
  readonly #pending = new Map<string, { index: number; size: number }>()
  constructor(private readonly options: SegmentBackWindowCleanerOptions) {}

  async clean(): Promise<SegmentBackWindowCleanupResult> {
    const snapshot = this.options.store.snapshot
    if (!this.options.reverseRegenerationValidated) {
      return { removedIndices: [], removedBytes: 0 }
    }
    const cutoff = (snapshot.consumptionPosition ?? 0) - (this.options.backWindowSeconds ?? 120)
    const result: SegmentBackWindowCleanupResult = { removedIndices: [], removedBytes: 0 }
    for (const entry of snapshot.entries) {
      if (entry.status !== 'published' || entry.endTime >= cutoff) continue
      const resource = this.options.store.evictAndTakeResource(entry.index)
      if (!resource) continue
      this.#pending.set(resource.path, {
        index: entry.index,
        size: resource.sizeBytes ?? entry.sizeBytes ?? 0,
      })
    }
    // 移交后文件不再可读；删除失败仍保留路径，下次清理重试，不能遗失孤立文件。
    for (const [path, pending] of this.#pending) {
      await (this.options.removeFile ?? removeResource)(path)
      this.#pending.delete(path)
      result.removedIndices.push(pending.index)
      result.removedBytes += pending.size
    }
    return result
  }
}

const removeResource = (path: string): Promise<void> => rm(path, { force: true })
