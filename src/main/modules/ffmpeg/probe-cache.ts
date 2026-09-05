import type { MediaProbeResult, MediaSourceFingerprint } from '@marchen/shared/media'

const cacheKey = (fingerprint: MediaSourceFingerprint): string =>
  [
    fingerprint.schemaVersion,
    fingerprint.sourceId,
    fingerprint.pathKey,
    fingerprint.size,
    fingerprint.mtimeMs,
  ].join(':')

export interface MediaProbeCacheOptions {
  maxEntries?: number
}

/** 同时缓存已完成结果与 in-flight Promise；失败立即移除，文件版本变化淘汰旧 pathKey。 */
export class MediaProbeCache {
  readonly #entries = new Map<string, Promise<MediaProbeResult>>()
  readonly #pathVersions = new Map<string, string>()
  readonly #maxEntries: number

  constructor(options: MediaProbeCacheOptions = {}) {
    this.#maxEntries = Math.max(1, options.maxEntries ?? 128)
  }

  getOrCreate(
    fingerprint: MediaSourceFingerprint,
    load: () => Promise<MediaProbeResult>,
  ): Promise<MediaProbeResult> {
    const key = cacheKey(fingerprint)
    const previousKey = this.#pathVersions.get(fingerprint.pathKey)
    if (previousKey && previousKey !== key) this.#entries.delete(previousKey)
    this.#pathVersions.set(fingerprint.pathKey, key)

    const cached = this.#entries.get(key)
    if (cached) {
      this.#entries.delete(key)
      this.#entries.set(key, cached)
      return cached
    }

    const pending = load().catch((error) => {
      if (this.#entries.get(key) === pending) this.#entries.delete(key)
      throw error
    })
    this.#entries.set(key, pending)
    this.#evict()
    return pending
  }

  clear(): void {
    this.#entries.clear()
    this.#pathVersions.clear()
  }

  #evict(): void {
    while (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next().value as string | undefined
      if (!oldest) return
      this.#entries.delete(oldest)
      for (const [pathKey, key] of this.#pathVersions) {
        if (key === oldest) this.#pathVersions.delete(pathKey)
      }
    }
  }
}
