import type { MediaSourceFingerprint } from '@marchen/shared/media'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const KEYFRAME_CACHE_SCHEMA_VERSION = 1 as const
const MAX_CACHE_FILE_BYTES = 8 * 1024 * 1024

export interface KeyframeMetadata {
  sourceStartTime: number
  duration: number
  durationReliable: boolean
  keyframes: number[]
  extractor: 'matroska-metadata' | 'ffprobe'
}

interface KeyframeCacheRecord extends KeyframeMetadata {
  schemaVersion: typeof KEYFRAME_CACHE_SCHEMA_VERSION
  source: MediaSourceFingerprint
  createdAt: number
}

const sourceIdentity = (source: MediaSourceFingerprint): string =>
  [source.schemaVersion, source.sourceId, source.pathKey, source.size, source.mtimeMs].join(':')

export const keyframeCacheFileName = (source: MediaSourceFingerprint): string =>
  `${createHash('sha256').update(sourceIdentity(source)).digest('hex')}.json`

const finiteNonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

const validRecord = (
  value: unknown,
  source: MediaSourceFingerprint,
): value is KeyframeCacheRecord => {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<KeyframeCacheRecord>
  return (
    record.schemaVersion === KEYFRAME_CACHE_SCHEMA_VERSION &&
    JSON.stringify(record.source) === JSON.stringify(source) &&
    finiteNonNegative(record.sourceStartTime) &&
    finiteNonNegative(record.duration) &&
    typeof record.durationReliable === 'boolean' &&
    (record.extractor === 'matroska-metadata' || record.extractor === 'ffprobe') &&
    Array.isArray(record.keyframes) &&
    record.keyframes.length > 0 &&
    record.keyframes.every(
      (item, index) =>
        finiteNonNegative(item) && (index === 0 || item > (record.keyframes?.[index - 1] ?? item)),
    )
  )
}

export class KeyframeMetadataCache {
  constructor(
    private readonly root: string,
    private readonly now: () => number = Date.now,
  ) {}

  async get(source: MediaSourceFingerprint): Promise<KeyframeMetadata | undefined> {
    const path = join(this.root, keyframeCacheFileName(source))
    try {
      const statistics = await lstat(path)
      if (
        !statistics.isFile() ||
        statistics.isSymbolicLink() ||
        statistics.size > MAX_CACHE_FILE_BYTES
      ) {
        await unlink(path).catch(() => undefined)
        return undefined
      }
      const value = JSON.parse(await readFile(path, 'utf8')) as unknown
      if (!validRecord(value, source)) {
        await unlink(path).catch(() => undefined)
        return undefined
      }
      return {
        sourceStartTime: value.sourceStartTime,
        duration: value.duration,
        durationReliable: value.durationReliable,
        keyframes: [...value.keyframes],
        extractor: value.extractor,
      }
    } catch {
      await unlink(path).catch(() => undefined)
      return undefined
    }
  }

  async set(source: MediaSourceFingerprint, metadata: KeyframeMetadata): Promise<void> {
    const record: KeyframeCacheRecord = {
      schemaVersion: KEYFRAME_CACHE_SCHEMA_VERSION,
      source: { ...source },
      sourceStartTime: metadata.sourceStartTime,
      duration: metadata.duration,
      durationReliable: metadata.durationReliable,
      keyframes: [...metadata.keyframes],
      extractor: metadata.extractor,
      createdAt: this.now(),
    }
    if (!validRecord(record, source)) throw new Error('关键帧缓存记录无效')
    await mkdir(this.root, { recursive: true })
    const finalPath = join(this.root, keyframeCacheFileName(source))
    const temporaryPath = join(this.root, `.${randomUUID()}.tmp`)
    try {
      await writeFile(temporaryPath, `${JSON.stringify(record)}\n`, { flag: 'wx' })
      await rename(temporaryPath, finalPath)
    } finally {
      await unlink(temporaryPath).catch(() => undefined)
    }
  }

  async entries(): Promise<string[]> {
    await mkdir(this.root, { recursive: true })
    return (await readdir(this.root)).filter((name) => name.endsWith('.json')).sort()
  }
}
