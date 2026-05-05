/**
 * DanmakuCache adapter：使用 IndexedDB (Dexie) 管理弹幕缓存
 *
 * 弹幕数据存储在 history 表的 danmaku 字段中。
 * isStale 通过 newBangumi 字段判断是否需要强制刷新。
 */

import type { DanmakuCache, DanmakuEntry } from '@marchen/player-core'
import { db } from '@renderer/database/db'

export class IndexedDBCache implements DanmakuCache {
  async get(hash: string): Promise<DanmakuEntry[] | null> {
    const history = await db.history.get(hash)
    return history?.danmaku ?? null
  }

  async set(hash: string, data: DanmakuEntry[]): Promise<void> {
    const existing = await db.history.get(hash)
    if (existing) {
      await db.history.update(hash, { danmaku: data })
    }
    // 如果 history 记录不存在，不单独创建（由 HistoryStore.save 负责）
  }

  async clear(hash: string): Promise<void> {
    await db.history.update(hash, { danmaku: undefined })
  }

  async isStale(hash: string): Promise<boolean> {
    const history = await db.history.get(hash)
    // 新番标记为 stale，需要重新请求弹幕
    return history?.newBangumi === true
  }
}
