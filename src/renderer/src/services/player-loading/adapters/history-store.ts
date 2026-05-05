/**
 * HistoryStore adapter：使用 IndexedDB (Dexie) 管理播放历史
 *
 * 负责历史记录的读写，包括首次创建和后续更新。
 * 首次创建时异步获取动漫封面和新番状态（不阻塞播放）。
 */

import type { HistoryEntry, HistoryStore } from '@marchen/player-core'
import { db } from '@renderer/database/db'
import { apiClient } from '@renderer/request'

export class IndexedDBHistoryStore implements HistoryStore {
  async save(entry: HistoryEntry): Promise<void> {
    const { hash } = entry
    const existing = await db.history.where({ hash }).first()

    const historyData = {
      ...entry,
      updatedAt: new Date().toISOString(),
    }

    if (!existing) {
      // 首次创建
      const primaryKey = await db.history.add({
        ...historyData,
        progress: 0,
        duration: 0,
      } as any)

      // 异步获取动漫封面和新番状态，不阻塞播放
      if (entry.animeId) {
        this.updateBangumiData(primaryKey, entry.animeId, historyData)
      }
      return
    }

    // 更新已有记录
    await db.history.update(hash, historyData)
  }

  async get(hash: string): Promise<HistoryEntry | null> {
    const record = await db.history.get(hash)
    if (!record) return null
    return record as unknown as HistoryEntry
  }

  /**
   * 异步获取动漫封面和新番状态
   * 不阻塞主流程，后台更新
   */
  private async updateBangumiData(
    primaryKey: string,
    animeId: number,
    historyData: any,
  ): Promise<void> {
    try {
      const [bangumiDetail, bangumiShin] = await Promise.all([
        apiClient.bangumi.getBangumiDetailById(animeId),
        apiClient.bangumi.getBangumiShin(),
      ])

      Object.assign(historyData, {
        cover: bangumiDetail.bangumi.imageUrl,
        newBangumi: bangumiShin.bangumiList.some((item) => item.animeId === +animeId),
      })
      await db.history.update(primaryKey, historyData)
    } catch (error) {
      console.error('获取动漫详情失败:', error)
    }
  }
}
