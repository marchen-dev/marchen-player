import type { MediaCompatErrorCode } from '@marchen/shared/media'
import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { access, lstat, mkdir, open, readdir, readFile, rm, statfs } from 'node:fs/promises'

import { basename, join, relative, resolve, sep } from 'node:path'

const MARKER_FILENAME = '.marchen-media-session.json'
const MARKER_KIND = 'marchen-media-session'

export const DEFAULT_MEDIA_CACHE_BUDGET_BYTES = 8 * 1024 * 1024 * 1024
export const DEFAULT_MEDIA_CACHE_MIN_FREE_BYTES = 2 * 1024 * 1024 * 1024
export const DEFAULT_MEDIA_CACHE_TTL_MS = 24 * 60 * 60 * 1000

interface MediaCacheMarker {
  kind: typeof MARKER_KIND
  schemaVersion: 1
  sessionId: string
  createdAt: number
}

export class MediaCacheError extends Error {
  constructor(
    readonly code: Extract<
      MediaCompatErrorCode,
      'cache-budget-exceeded' | 'disk-space-low' | 'session-not-found'
    >,
    message: string,
  ) {
    super(message)
    this.name = 'MediaCacheError'
  }
}

export interface MediaSessionCache {
  sessionId: string
  directory: string
  reserve: (bytes: number) => Promise<void>
  measure: () => Promise<number>
  release: () => Promise<void>
}

export interface MediaCacheManagerOptions {
  root: string
  sessionBudgetBytes?: number
  minimumFreeBytes?: number
  ttlMs?: number
  now?: () => number
  freeSpace?: (path: string) => Promise<number>
}

const defaultFreeSpace = async (path: string): Promise<number> => {
  const statistics = await statfs(path)
  return statistics.bavail * statistics.bsize
}

const directorySize = async (directory: string): Promise<number> => {
  let total = 0
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) total += await directorySize(path)
    else if (entry.isFile()) total += (await lstat(path)).size
  }
  return total
}

const readMarker = async (directory: string): Promise<MediaCacheMarker | undefined> => {
  try {
    const value = JSON.parse(
      await readFile(join(directory, MARKER_FILENAME), 'utf8'),
    ) as Partial<MediaCacheMarker>
    if (
      value.kind !== MARKER_KIND ||
      value.schemaVersion !== 1 ||
      typeof value.sessionId !== 'string' ||
      typeof value.createdAt !== 'number'
    ) {
      return undefined
    }
    return value as MediaCacheMarker
  } catch {
    return undefined
  }
}

export class MediaCacheManager {
  readonly #root: string
  readonly #sessionBudgetBytes: number
  readonly #minimumFreeBytes: number
  readonly #ttlMs: number
  readonly #now: () => number
  readonly #freeSpace: (path: string) => Promise<number>
  readonly #activeSessions = new Set<string>()

  constructor(options: MediaCacheManagerOptions) {
    this.#root = resolve(options.root)
    this.#sessionBudgetBytes = options.sessionBudgetBytes ?? DEFAULT_MEDIA_CACHE_BUDGET_BYTES
    this.#minimumFreeBytes = options.minimumFreeBytes ?? DEFAULT_MEDIA_CACHE_MIN_FREE_BYTES
    this.#ttlMs = options.ttlMs ?? DEFAULT_MEDIA_CACHE_TTL_MS
    this.#now = options.now ?? Date.now
    this.#freeSpace = options.freeSpace ?? defaultFreeSpace
  }

  async createSession(): Promise<MediaSessionCache> {
    await mkdir(this.#root, { recursive: true })
    await this.#assertFreeSpace(0)
    const sessionId = randomUUID()
    const directory = join(this.#root, `session-${sessionId}`)
    await mkdir(directory, { recursive: false })
    const marker: MediaCacheMarker = {
      kind: MARKER_KIND,
      schemaVersion: 1,
      sessionId,
      createdAt: this.#now(),
    }
    const markerFile = await open(
      join(directory, MARKER_FILENAME),
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
    )
    try {
      await markerFile.writeFile(`${JSON.stringify(marker)}\n`)
    } finally {
      await markerFile.close()
    }
    this.#activeSessions.add(sessionId)

    return {
      sessionId,
      directory,
      reserve: async (bytes) => {
        if (!Number.isSafeInteger(bytes) || bytes < 0) throw new TypeError('缓存预留字节数无效')
        await this.#assertManagedSession(directory, sessionId)
        const used = await directorySize(directory)
        if (used + bytes > this.#sessionBudgetBytes) {
          throw new MediaCacheError(
            'cache-budget-exceeded',
            `媒体会话缓存将超过 ${this.#sessionBudgetBytes} 字节预算`,
          )
        }
        await this.#assertFreeSpace(bytes)
      },
      measure: async () => {
        await this.#assertManagedSession(directory, sessionId)
        return directorySize(directory)
      },
      release: async () => {
        await this.#assertManagedSession(directory, sessionId)
        this.#activeSessions.delete(sessionId)
        await rm(directory, { recursive: true, force: true })
      },
    }
  }

  async sweepExpired(): Promise<string[]> {
    await mkdir(this.#root, { recursive: true })
    const removed: string[] = []
    for (const entry of await readdir(this.#root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const directory = join(this.#root, entry.name)
      const marker = await readMarker(directory)
      if (!marker || this.#activeSessions.has(marker.sessionId)) continue
      if (this.#now() - marker.createdAt < this.#ttlMs) continue
      await rm(directory, { recursive: true, force: true })
      removed.push(entry.name)
    }
    return removed
  }

  async #assertFreeSpace(reservedBytes: number): Promise<void> {
    const available = await this.#freeSpace(this.#root)
    if (available - reservedBytes < this.#minimumFreeBytes) {
      throw new MediaCacheError(
        'disk-space-low',
        `磁盘可用空间不足，至少需要保留 ${this.#minimumFreeBytes} 字节`,
      )
    }
  }

  async #assertManagedSession(directory: string, sessionId: string): Promise<void> {
    const normalized = resolve(directory)
    const relativePath = relative(this.#root, normalized)
    if (!relativePath || relativePath.startsWith(`..${sep}`) || relativePath === '..') {
      throw new MediaCacheError('session-not-found', '媒体缓存目录不在受管根目录内')
    }
    const marker = await readMarker(normalized)
    if (
      !marker ||
      marker.sessionId !== sessionId ||
      basename(normalized) !== `session-${sessionId}`
    ) {
      throw new MediaCacheError('session-not-found', '媒体缓存目录缺少有效会话标记')
    }
    await access(normalized, constants.W_OK)
  }
}
