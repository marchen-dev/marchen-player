/**
 * HistoryStore adapter：使用 IndexedDB (Dexie) 管理播放历史
 *
 * 负责历史记录的读写，包括首次创建和后续更新。
 * 首次创建时异步获取动漫封面和新番状态（不阻塞播放）。
 * 同时将作品信息写入 library 表。
 */

import type { HistoryEntry, HistoryStore } from '@marchen/player-core'
import { db } from '@renderer/database/db'
import { upsertLibraryEntry } from '@renderer/database/lib/library-writer'
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
        this.updateBangumiData(primaryKey, entry.animeId, entry.episodeId, hash, historyData)
      }
      return
    }

    // 更新已有记录
    await db.history.update(hash, historyData)

    // 如果有 animeId 和 episodeId，更新 library 表的观看状态
    if (entry.animeId && entry.episodeId) {
      this.updateLibraryOnReplay(entry.animeId, entry.episodeId, hash)
    }
  }

  async get(hash: string): Promise<HistoryEntry | null> {
    const record = await db.history.get(hash)
    if (!record) return null
    return record as unknown as HistoryEntry
  }

  /**
   * 异步获取动漫封面和新番状态，并写入 library 表
   */
  private async updateBangumiData(
    primaryKey: string,
    animeId: number,
    episodeId: number | undefined,
    fileHash: string,
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

      // 写入 library 表
      if (episodeId) {
        await upsertLibraryEntry(bangumiDetail, episodeId, fileHash)
      }
    } catch (error) {
      console.error('获取动漫详情失败:', error)
    }
  }

  /**
   * 重复播放时更新 library 表（只关联 fileHash，不标记已看）
   * 如果 episodes 为空（迁移产生的不完整记录），重新获取详情补全
   */
  private async updateLibraryOnReplay(
    animeId: number,
    episodeId: number,
    fileHash: string,
  ): Promise<void> {
    try {
      const existing = await db.library.get(animeId)
      if (!existing) return

      // 如果 episodes 为空（v4 迁移产生的不完整记录），重新获取详情补全
      if (existing.episodes.length === 0) {
        const bangumiDetail = await apiClient.bangumi.getBangumiDetailById(animeId)
        await upsertLibraryEntry(bangumiDetail, episodeId, fileHash)
        return
      }

      // 只关联 fileHash，不标记已看（已看由 90% 进度触发）
      const episodes = existing.episodes.map((ep) =>
        ep.episodeId === episodeId ? { ...ep, fileHash } : ep,
      )

      await db.library.update(animeId, {
        episodes,
      })
    } catch (error) {
      console.error('更新 library 失败:', error)
    }
  }
}
