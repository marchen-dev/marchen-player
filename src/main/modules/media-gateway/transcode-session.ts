import type {
  MediaCompatError,
  MediaGenerationSnapshot,
  MediaSessionEvent,
  MediaSessionSnapshot,
  PlaybackMode,
  PlaybackSourceLeaseDescriptor,
} from '@marchen/shared/media'
import type { MediaCacheManager, MediaSessionCache } from '../ffmpeg/cache'

import type { FfmpegExecution, FfmpegProgressRecord } from '../ffmpeg/executor'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { MediaCacheError } from '../ffmpeg/cache'
import { toMediaCompatError } from './errors'

export interface TranscodeGenerationContext {
  directory: string
  signal: AbortSignal
  reportProgress: (record: Readonly<FfmpegProgressRecord>) => void
  reportPublication: (summary: { segmentCount: number; producedDuration: number }) => void
  ensureCacheBudget: () => Promise<void>
  recordFirstTimestamp: (timestamp: number) => void
  markReady: (lease: PlaybackSourceLeaseDescriptor) => void
}

export type TranscodeGenerationProducer = (context: TranscodeGenerationContext) => FfmpegExecution

export interface TranscodeSessionOptions {
  id: string
  logicalSourceId: string
  mode: Exclude<PlaybackMode, 'direct'>
  profile?: import('@marchen/shared/media').OutputProfileKind
  attemptChain?: import('@marchen/shared/media').OutputProfileKind[]
  generation?: number
  originalStartTime: number
  requestedStartTime: number
  cacheManager: MediaCacheManager
  encoderClass?: MediaGenerationSnapshot['encoderClass']
}

const progressNumber = (record: Readonly<FfmpegProgressRecord>, keys: string[]) => {
  for (const key of keys) {
    const value = Number(record[key])
    if (Number.isFinite(value) && value >= 0) return value
  }
  return undefined
}

const generationError = (cause: unknown): MediaCompatError => {
  if (cause instanceof MediaCacheError) {
    return { code: cause.code, message: cause.message, recoverable: true }
  }
  return toMediaCompatError(cause, {
    code: 'generation-failed',
    stage: 'transcode',
    message: '兼容媒体 generation 生产失败',
    recoverable: true,
  })
}

/** 单个逻辑媒体会话的一次 generation；seek 会创建新的实例并淘汰旧实例。 */
export class TranscodeSession {
  readonly #listeners = new Set<(event: MediaSessionEvent) => void>()
  readonly #abort = new AbortController()
  readonly #generationNumber: number
  #session: MediaSessionSnapshot
  #generation: MediaGenerationSnapshot
  #cache?: MediaSessionCache
  #execution?: FfmpegExecution
  #releasePromise?: Promise<void>
  #started = false

  constructor(private readonly options: TranscodeSessionOptions) {
    this.#generationNumber = options.generation ?? 0
    this.#session = {
      id: options.id,
      logicalSourceId: options.logicalSourceId,
      mode: options.mode,
      profile: options.profile,
      attemptChain: options.attemptChain,
      status: 'preparing',
      phase: 'planning',
      activeGeneration: this.#generationNumber,
    }
    this.#generation = {
      sessionId: options.id,
      generation: this.#generationNumber,
      status: 'starting',
      originalStartTime: options.originalStartTime,
      requestedStartTime: options.requestedStartTime,
      encoderClass: options.encoderClass,
    }
  }

  get session(): MediaSessionSnapshot {
    return structuredClone(this.#session)
  }

  get generation(): MediaGenerationSnapshot {
    return structuredClone(this.#generation)
  }

  subscribe(listener: (event: MediaSessionEvent) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  acknowledge(
    phase: 'attaching' | 'playable' | 'failed',
    error?: MediaCompatError,
  ): MediaSessionSnapshot {
    if (this.#session.status === 'released') throw new Error('媒体会话已经释放')
    if (phase === 'failed') {
      if (!error) throw new Error('浏览器失败确认缺少结构化错误')
      this.#abort.abort(error)
      this.#execution?.cancel()
      this.#generation = { ...this.#generation, status: 'failed' }
      this.#session = { ...this.#session, status: 'failed', phase: 'failed', error }
      this.#emitSnapshots()
      return this.session
    }
    if (phase === 'attaching') {
      if (this.#session.phase !== 'producer-ready' && this.#session.phase !== 'attaching') {
        throw new Error('只有 Producer 就绪后才能确认浏览器 attaching')
      }
    } else if (this.#session.phase !== 'attaching' && this.#session.phase !== 'playable') {
      throw new Error('只有浏览器 attaching 后才能确认 playable')
    }
    this.#session = { ...this.#session, phase }
    this.#emit({ type: 'session-changed', session: this.session })
    return this.session
  }

  async start(producer: TranscodeGenerationProducer): Promise<void> {
    if (this.#started) throw new Error('generation 已经启动')
    if (this.#session.status === 'released') throw new Error('媒体会话已经释放')
    this.#started = true
    try {
      const cache = await this.options.cacheManager.createSession()
      if (this.#isReleased()) {
        await cache.release()
        return
      }
      this.#cache = cache
      const directory = join(cache.directory, `generation-${this.#generationNumber}`)
      await mkdir(directory, { recursive: false })

      this.#session = { ...this.#session, status: 'running', phase: 'producing' }
      this.#generation = { ...this.#generation, status: 'producing' }
      this.#emitSnapshots()

      const execution = producer({
        directory,
        signal: this.#abort.signal,
        reportProgress: (record) => this.#reportProgress(record),
        reportPublication: (summary) => this.#reportPublication(summary),
        ensureCacheBudget: () => cache.reserve(0),
        recordFirstTimestamp: (timestamp) => this.#recordFirstTimestamp(timestamp),
        markReady: (lease) => this.#markReady(lease),
      })
      this.#execution = execution
      void execution.result.then(
        () => this.#finish(),
        (cause) => this.#fail(cause),
      )
    } catch (cause) {
      this.#fail(cause)
    }
  }

  release(): Promise<void> {
    this.#releasePromise ??= this.#release()
    return this.#releasePromise
  }

  #markReady(lease: PlaybackSourceLeaseDescriptor): void {
    if (this.#session.status !== 'running' || this.#abort.signal.aborted) return
    if (lease.generation !== this.#generationNumber || lease.sessionId !== this.options.id) {
      throw new Error('就绪 lease 与当前 generation 不匹配')
    }
    this.#session = { ...this.#session, status: 'ready', phase: 'producer-ready', lease }
    this.#emit({ type: 'session-changed', session: this.session })
  }

  #recordFirstTimestamp(timestamp: number): void {
    if (!Number.isFinite(timestamp) || this.#generation.status !== 'producing') return
    this.#generation = { ...this.#generation, actualFirstTimestamp: timestamp }
    this.#emit({ type: 'generation-changed', generation: this.generation })
  }

  #reportProgress(record: Readonly<FfmpegProgressRecord>): void {
    if (this.#generation.status !== 'producing') return
    const outputMicroseconds = progressNumber(record, ['out_time_us', 'out_time_ms'])
    const bytesWritten = progressNumber(record, ['total_size'])
    this.#generation = {
      ...this.#generation,
      producedDuration:
        outputMicroseconds === undefined
          ? this.#generation.producedDuration
          : outputMicroseconds / 1_000_000,
      bytesWritten: bytesWritten ?? this.#generation.bytesWritten,
    }
    this.#emit({ type: 'generation-changed', generation: this.generation })
  }

  #reportPublication(summary: { segmentCount: number; producedDuration: number }): void {
    if (this.#generation.status !== 'producing') return
    this.#generation = {
      ...this.#generation,
      segmentCount: summary.segmentCount,
      producedDuration: Math.max(this.#generation.producedDuration ?? 0, summary.producedDuration),
    }
    this.#emit({ type: 'generation-changed', generation: this.generation })
  }

  #finish(): void {
    if (this.#session.status === 'released' || this.#session.status === 'failed') return
    this.#generation = { ...this.#generation, status: 'finished' }
    if (this.#session.status !== 'ready') {
      this.#session = {
        ...this.#session,
        status: 'failed',
        phase: 'failed',
        error: generationError(new Error('FFmpeg 已结束但没有发布可播放资源')),
      }
    }
    this.#emitSnapshots()
  }

  #fail(cause: unknown): void {
    if (this.#session.status === 'released' || this.#session.status === 'failed') return
    if (this.#abort.signal.aborted) {
      this.#generation = { ...this.#generation, status: 'cancelled' }
      this.#emit({ type: 'generation-changed', generation: this.generation })
      return
    }
    this.#generation = { ...this.#generation, status: 'failed' }
    this.#session = {
      ...this.#session,
      status: 'failed',
      phase: 'failed',
      error: generationError(cause),
    }
    this.#emitSnapshots()
  }

  async #release(): Promise<void> {
    if (this.#session.status === 'released') return
    this.#abort.abort()
    this.#execution?.cancel()
    if (this.#generation.status === 'starting' || this.#generation.status === 'producing') {
      this.#generation = { ...this.#generation, status: 'cancelled' }
      this.#emit({ type: 'generation-changed', generation: this.generation })
    }
    await this.#execution?.result.catch(() => undefined)
    const cache = this.#cache
    this.#cache = undefined
    if (cache) await cache.release()
    this.#session = {
      ...this.#session,
      status: 'released',
      phase: 'released',
      lease: undefined,
    }
    this.#emit({ type: 'session-changed', session: this.session })
    this.#listeners.clear()
  }

  #emitSnapshots(): void {
    this.#emit({ type: 'session-changed', session: this.session })
    this.#emit({ type: 'generation-changed', generation: this.generation })
  }

  #emit(event: MediaSessionEvent): void {
    for (const listener of this.#listeners) listener(event)
  }

  #isReleased(): boolean {
    return this.#session.status === 'released'
  }
}
