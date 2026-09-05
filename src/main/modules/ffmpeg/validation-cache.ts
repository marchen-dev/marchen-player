import type { MediaSourceFingerprint, PipelineFingerprint } from '@marchen/shared/media'

export interface MediaValidationCacheKeyInput {
  source: MediaSourceFingerprint
  videoStreamIndex: number
  audioStreamIndex?: number
  target: string
  pipeline?: PipelineFingerprint
}

export const createMediaValidationCacheKey = (input: MediaValidationCacheKeyInput): string =>
  [
    input.source.schemaVersion,
    input.source.sourceId,
    input.source.pathKey,
    input.source.size,
    input.source.mtimeMs,
    input.videoStreamIndex,
    input.audioStreamIndex ?? 'none',
    input.target,
    input.pipeline?.schemaVersion ?? 'none',
    input.pipeline?.value ?? 'none',
  ].join(':')

type CacheEntry<T> =
  | { state: 'pending'; promise: Promise<T> }
  | { state: 'success'; value: T; expiresAt: number }
  | { state: 'failure'; error: unknown; expiresAt: number }

export interface MediaValidationCacheOptions {
  successTtlMs?: number
  failureTtlMs?: number
  maxEntries?: number
  now?: () => number
}

/** target probe 与真实 preflight 共用：成功长缓存，失败只短暂缓存，in-flight 自动合并。 */
export class MediaValidationCache<T> {
  readonly #entries = new Map<string, CacheEntry<T>>()
  readonly #successTtlMs: number
  readonly #failureTtlMs: number
  readonly #maxEntries: number
  readonly #now: () => number

  constructor(options: MediaValidationCacheOptions = {}) {
    this.#successTtlMs = Math.max(0, options.successTtlMs ?? 30 * 60 * 1000)
    this.#failureTtlMs = Math.max(0, options.failureTtlMs ?? 5_000)
    this.#maxEntries = Math.max(1, options.maxEntries ?? 128)
    this.#now = options.now ?? Date.now
  }

  getOrCreate(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.#entries.get(key)
    if (cached?.state === 'pending') return cached.promise
    if (cached && cached.expiresAt > this.#now()) {
      this.#touch(key, cached)
      return cached.state === 'success'
        ? Promise.resolve(cached.value)
        : Promise.reject(cached.error)
    }
    if (cached) this.#entries.delete(key)

    const pending = load().then(
      (value) => {
        this.#entries.set(key, {
          state: 'success',
          value,
          expiresAt: this.#now() + this.#successTtlMs,
        })
        this.#evict()
        return value
      },
      (error) => {
        this.#entries.set(key, {
          state: 'failure',
          error,
          expiresAt: this.#now() + this.#failureTtlMs,
        })
        this.#evict()
        throw error
      },
    )
    this.#entries.set(key, { state: 'pending', promise: pending })
    this.#evict()
    return pending
  }

  clear(): void {
    this.#entries.clear()
  }

  #touch(key: string, entry: CacheEntry<T>): void {
    this.#entries.delete(key)
    this.#entries.set(key, entry)
  }

  #evict(): void {
    while (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next().value as string | undefined
      if (!oldest) return
      this.#entries.delete(oldest)
    }
  }
}
