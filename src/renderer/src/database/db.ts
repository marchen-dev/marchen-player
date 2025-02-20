import type { EntityTable } from 'dexie'
import Dexie from 'dexie'

import { LOCAL_DB_NAME, TABLES } from './constants'
import { dbSchemaV1, dbSchemaV2, dbSchemaV3 } from './db.schema'
import type { DB_Bangumi } from './schemas/bangumi'
import type { DB_History } from './schemas/history'

class LocalDB extends Dexie {
  history: EntityTable<DB_History, 'hash'>
  bangumi: EntityTable<DB_Bangumi, 'animeId'>

  constructor() {
    super(LOCAL_DB_NAME)
    this.version(1).stores(dbSchemaV1)
    this.version(2)
      .stores(dbSchemaV2)
      .upgrade(async (trans) => {
        const historyTable = trans.table<DB_History>(TABLES.HISTORY)
        const allRecords = await historyTable.toArray()
        for (const record of allRecords) {
          delete record.danmaku
          await historyTable.put(record)
        }
      })
    this.version(3).stores(dbSchemaV3)
    this.history = this.table(TABLES.HISTORY)
    this.bangumi = this.table(TABLES.BANGUMI)
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
