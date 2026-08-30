import type { TelemetryEventName } from './contracts'

export const OUTBOX_MAX_ITEMS = 500
export const OUTBOX_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000
const MAX_RETRY_DELAY_MS = 60 * 60 * 1_000

export const CRITICAL_TELEMETRY_EVENTS = new Set<TelemetryEventName>([
  'app_session_started',
  'app_session_ended',
  'video_import_completed',
  'video_import_failed',
  'danmaku_match_completed',
  'playback_started',
  'playback_ended',
  'playback_failed',
])

export interface OutboxItem {
  id: string
  name: TelemetryEventName
  properties: Record<string, unknown>
  createdAt: number
  attempts: number
  nextAttemptAt: number
}

export interface OutboxStorage {
  list: () => Promise<OutboxItem[]>
  put: (item: OutboxItem) => Promise<void>
  delete: (id: string) => Promise<void>
  clear: () => Promise<void>
}

const retryDelay = (attempts: number): number =>
  Math.min(MAX_RETRY_DELAY_MS, 1_000 * 2 ** Math.min(attempts, 12))

export class TelemetryOutbox {
  private droppedCount = 0

  constructor(
    private readonly storage: OutboxStorage,
    private readonly now: () => number = Date.now,
  ) {}

  async enqueue(
    name: TelemetryEventName,
    properties: OutboxItem['properties'],
    id: string = crypto.randomUUID(),
  ): Promise<OutboxItem> {
    const now = this.now()
    const item: OutboxItem = {
      id,
      name,
      properties: { ...properties, $insert_id: id },
      createdAt: now,
      attempts: 0,
      nextAttemptAt: now,
    }
    await this.storage.put(item)
    await this.prune()
    return item
  }

  async drain(send: (item: OutboxItem) => Promise<boolean>): Promise<void> {
    const now = this.now()
    await this.prune()
    const items = (await this.storage.list()).sort((a, b) => a.createdAt - b.createdAt)
    for (const item of items) {
      if (item.nextAttemptAt > now) continue
      try {
        if (await send(item)) {
          await this.storage.delete(item.id)
          continue
        }
      } catch {
        // 失败进入统一退避分支。
      }
      const attempts = item.attempts + 1
      await this.storage.put({ ...item, attempts, nextAttemptAt: now + retryDelay(attempts) })
    }
  }

  clear(): Promise<void> {
    return this.storage.clear()
  }

  getDroppedCount(): number {
    return this.droppedCount
  }

  private async prune(): Promise<void> {
    const items = (await this.storage.list()).sort((a, b) => a.createdAt - b.createdAt)
    const expiredBefore = this.now() - OUTBOX_MAX_AGE_MS
    const overflow = Math.max(0, items.length - OUTBOX_MAX_ITEMS)
    const discarded = items.filter(
      (item, index) => item.createdAt < expiredBefore || index < overflow,
    )
    this.droppedCount += discarded.length
    await Promise.all(discarded.map((item) => this.storage.delete(item.id)))
  }
}

export const createIndexedDbOutboxStorage = (): OutboxStorage => {
  const database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('marchen-telemetry', 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('events')) {
        request.result.createObjectStore('events', { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  const transaction = async <T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> => {
    const db = await database
    return new Promise<T>((resolve, reject) => {
      const request = run(db.transaction('events', mode).objectStore('events'))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }
  return {
    list: () => transaction('readonly', (store) => store.getAll()),
    put: (item) => transaction('readwrite', (store) => store.put(item)).then(() => undefined),
    delete: (id) => transaction('readwrite', (store) => store.delete(id)).then(() => undefined),
    clear: () => transaction('readwrite', (store) => store.clear()).then(() => undefined),
  }
}
