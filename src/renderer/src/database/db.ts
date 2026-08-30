import type { EntityTable } from 'dexie'
import type { DB_History } from './schemas/history'
import type { DB_Library } from './schemas/library'

import Dexie from 'dexie'
import { LOCAL_DB_NAME, TABLES } from './constants'
import { dbSchemaV1, dbSchemaV2, dbSchemaV3 } from './db.schema'
import { migrateLegacyHistoryPath } from './migrations/media-path'
import { assertPersistentMediaPath } from './persistence/media-path'

class LocalDB extends Dexie {
  history: EntityTable<DB_History, 'hash'>
  library: EntityTable<DB_Library, 'animeId'>

  constructor() {
    super(LOCAL_DB_NAME)
    this.version(1).stores(dbSchemaV1)
    this.version(2)
      .stores(dbSchemaV1)
      .upgrade(async (trans) => {
        const historyTable = trans.table<DB_History>(TABLES.HISTORY)
        const allRecords = await historyTable.toArray()
        for (const record of allRecords) {
          delete record.danmaku
          await historyTable.put(record)
        }
      })
    // v3: 弹幕数据模型简化，清空非 local 类型的弹幕缓存，下次播放时重新请求
    this.version(3)
      .stores(dbSchemaV2)
      .upgrade(async (trans) => {
        const historyTable = trans.table<DB_History>(TABLES.HISTORY)
        const allRecords = await historyTable.toArray()
        for (const record of allRecords) {
          if (record.danmaku) {
            // 只保留用户手动导入的本地弹幕
            const localDanmaku = record.danmaku.filter((item) => item.type === 'local')
            record.danmaku = localDanmaku.length > 0 ? localDanmaku : undefined
            await historyTable.put(record)
          }
        }
      })
    // v4: 新增 library 表，从 history 记录中提取作品级别信息
    this.version(4)
      .stores(dbSchemaV3)
      .upgrade(async (trans) => {
        const historyTable = trans.table<DB_History>(TABLES.HISTORY)
        const libraryTable = trans.table<DB_Library>(TABLES.LIBRARY)
        const allRecords = await historyTable.toArray()

        // 按 animeId 分组
        const animeGroups = new Map<number, DB_History[]>()
        for (const record of allRecords) {
          if (record.animeId) {
            const group = animeGroups.get(record.animeId) || []
            group.push(record)
            animeGroups.set(record.animeId, group)
          }
        }

        // 为每个 anime 创建 library 记录
        for (const [animeId, records] of animeGroups) {
          const latest = records.sort((a, b) =>
            (b.updatedAt || '').localeCompare(a.updatedAt || ''),
          )[0]

          await libraryTable.add({
            animeId,
            title: latest.animeTitle || '未知',
            imageUrl: latest.cover || '',
            type: 'tvseries',
            typeDescription: 'TV动画',
            rating: 0,
            summary: '',
            totalEpisodes: 0,
            airDate: '',
            isOnAir: false,
            tags: [],
            intro: '',
            episodes: [],
            watchedEpisodeIds: records.filter((r) => r.episodeId).map((r) => r.episodeId!),
            lastWatchedEpisodeId: latest.episodeId,
            lastWatchedAt: latest.updatedAt || new Date().toISOString(),
            addedAt: latest.updatedAt || new Date().toISOString(),
          })
        }
      })
    // v5: 临时协议 URL 不再作为持久化 locator；无法保守恢复的记录保留诊断信息。
    this.version(5)
      .stores(dbSchemaV3)
      .upgrade(async (trans) => {
        const historyTable = trans.table<DB_History>(TABLES.HISTORY)
        await historyTable.toCollection().modify((record) => {
          if (!record.path) return
          const result = migrateLegacyHistoryPath(record.path)
          record.path = result.path
          record.pathStatus = result.status
          if (result.status === 'unresolved') {
            record.originalPath = result.originalPath
            record.pathMigrationError = result.reason
          } else {
            delete record.originalPath
            delete record.pathMigrationError
          }
        })
      })
    this.history = this.table(TABLES.HISTORY)
    this.library = this.table(TABLES.LIBRARY)
    this.history.hook('creating', (_primaryKey, record) => assertPersistentMediaPath(record))
    this.history.hook('updating', (changes, _primaryKey, record) => {
      assertPersistentMediaPath({ ...record, ...changes })
    })
  }

  async deleteDatabase(): Promise<void> {
    try {
      db.close()
      await Dexie.delete(db.name)
    } catch (error) {
      console.error('删除数据库失败:', error)
    }
  }
}

export const db = new LocalDB()
