import type { EntityTable } from 'dexie'
import Dexie from 'dexie'

import { LOCAL_DB_NAME, TABLES } from './constants'
import { dbSchemaV1 } from './db.schema'
import type { DB_History } from './schemas/history'

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
    this.history = this.table(TABLES.HISTORY)
  }
}

export const db = new LocalDB()
