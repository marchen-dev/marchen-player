import type { EntityTable } from 'dexie'
import type { DB_History } from './schemas/history'

import Dexie from 'dexie'
import { LOCAL_DB_NAME, TABLES } from './constants'
import { dbSchemaV1, dbSchemaV2 } from './db.schema'

class LocalDB extends Dexie {
  history: EntityTable<DB_History, 'hash'>

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
    this.history = this.table(TABLES.HISTORY)
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
