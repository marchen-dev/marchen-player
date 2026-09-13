import type { EntityTable } from 'dexie'
import type { DB_History } from './schemas/history'
import type { DB_Library } from './schemas/library'

import Dexie from 'dexie'
import { LOCAL_DB_NAME, TABLES } from './constants'
import { dbSchema } from './db.schema'
import { assertPersistentMediaPath } from './persistence/media-path'

class LocalDB extends Dexie {
  history: EntityTable<DB_History, 'hash'>
  library: EntityTable<DB_Library, 'animeId'>

  constructor() {
    super(LOCAL_DB_NAME)
    // 新业务存储独立初始化，不搬迁或删除旧 origin/旧数据库的数据。
    this.version(1).stores(dbSchema)
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
