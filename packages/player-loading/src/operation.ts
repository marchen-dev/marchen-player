import type { ServiceDeps } from './types'

/** 同一 hash 的写入按提交顺序完成，避免旧 Promise 较晚落盘覆盖新操作。 */
export class LoadingOperations {
  private controller = new AbortController()
  private writes = new Map<string, Promise<void>>()

  cancel() {
    this.controller.abort()
  }

  start(deps: ServiceDeps): ServiceDeps {
    this.cancel()
    const controller = new AbortController()
    this.controller = controller
    const { signal } = controller
    const failedHistoryWrites = new Set<string>()
    const check = () => signal.throwIfAborted()
    const read = async <T>(hash: string, action: () => Promise<T>, fallback: T): Promise<T> => {
      check()
      await this.writes.get(hash)
      check()
      try {
        const value = await action()
        check()
        return value
      } catch (error) {
        check()
        // 本地存储不可用不应阻止已导入的视频播放。
        console.error('读取播放记录失败:', error)
        return fallback
      }
    }
    const write = (hash: string, action: () => Promise<void>) => {
      const pending = (this.writes.get(hash) ?? Promise.resolve()).then(async () => {
        if (signal.aborted) return
        try {
          await action()
        } catch (error) {
          if (!signal.aborted) console.error('保存播放记录失败:', error)
        }
      })
      this.writes.set(hash, pending)
      void pending.then(() => {
        if (this.writes.get(hash) === pending) this.writes.delete(hash)
      })
      return pending
    }
    return {
      ...deps,
      api: {
        match: async (params) => {
          check()
          const result = await deps.api.match(params, signal)
          check()
          return result
        },
        getDanmu: async (episodeId, opts) => {
          check()
          const result = await deps.api.getDanmu(episodeId, { ...opts, signal })
          check()
          return result
        },
      },
      history: {
        get: (hash) => read(hash, () => deps.history.get(hash), null),
        save: (entry) =>
          write(entry.hash, async () => {
            try {
              await deps.history.save(entry)
              failedHistoryWrites.delete(entry.hash)
            } catch (error) {
              // 匹配元数据没有保存成功时，不能单独把新弹幕写到旧匹配记录中。
              failedHistoryWrites.add(entry.hash)
              throw error
            }
          }),
      },
      cache: {
        get: (hash) => read(hash, () => deps.cache.get(hash), null),
        isStale: (hash) => read(hash, () => deps.cache.isStale(hash), true),
        set: (hash, data) =>
          write(hash, async () => {
            if (!failedHistoryWrites.has(hash)) await deps.cache.set(hash, data)
          }),
        clear: (hash) => write(hash, () => deps.cache.clear(hash)),
      },
    }
  }
}
