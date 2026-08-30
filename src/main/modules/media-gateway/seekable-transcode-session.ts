import type {
  MediaGenerationSnapshot,
  MediaSessionEvent,
  MediaSessionSnapshot,
  PlaybackMode,
} from '@marchen/shared/media'
import type { TranscodeGenerationProducer } from './transcode-session'

export interface TranscodeGenerationHandle {
  readonly session: MediaSessionSnapshot
  readonly generation: MediaGenerationSnapshot
  subscribe: (listener: (event: MediaSessionEvent) => void) => () => void
  start: (producer: TranscodeGenerationProducer) => Promise<void>
  acknowledge: (
    phase: 'attaching' | 'playable' | 'failed',
    error?: import('@marchen/shared/media').MediaCompatError,
  ) => MediaSessionSnapshot
  release: () => Promise<void>
}

export interface SeekableGenerationFactoryInput {
  sessionId: string
  logicalSourceId: string
  mode: Exclude<PlaybackMode, 'direct'>
  generation: number
  originalStartTime: number
  requestedStartTime: number
}

export interface SeekableTranscodeSessionOptions extends Omit<
  SeekableGenerationFactoryInput,
  'generation' | 'requestedStartTime'
> {
  initialStartTime: number
  createGeneration: (input: SeekableGenerationFactoryInput) => TranscodeGenerationHandle
  createProducer: (input: SeekableGenerationFactoryInput) => TranscodeGenerationProducer
}

/** 同一逻辑 session 串行切换 generation；旧进程完全取消后才启动新 seek。 */
export class SeekableTranscodeSession {
  readonly #listeners = new Set<(event: MediaSessionEvent) => void>()
  #current?: TranscodeGenerationHandle
  #unsubscribe?: () => void
  #operation: Promise<unknown> = Promise.resolve()
  #released = false

  constructor(private readonly options: SeekableTranscodeSessionOptions) {}

  get session(): MediaSessionSnapshot | undefined {
    return this.#current?.session
  }

  subscribe(listener: (event: MediaSessionEvent) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  start(): Promise<MediaSessionSnapshot> {
    return this.#enqueue(() => this.#startGeneration(0, this.options.initialStartTime))
  }

  seek(expectedGeneration: number, logicalTime: number): Promise<MediaSessionSnapshot> {
    return this.#enqueue(async () => {
      if (this.#released) throw new Error('媒体会话已经释放')
      const activeGeneration = this.#current?.generation.generation
      if (activeGeneration !== expectedGeneration) throw new Error('seek generation 已过期')
      await this.#releaseCurrent()
      return this.#startGeneration(expectedGeneration + 1, Math.max(0, logicalTime))
    })
  }

  acknowledge(
    generation: number,
    phase: 'attaching' | 'playable' | 'failed',
    error?: import('@marchen/shared/media').MediaCompatError,
  ): MediaSessionSnapshot {
    if (this.#released || !this.#current) throw new Error('媒体会话已经释放')
    if (this.#current.generation.generation !== generation)
      throw new Error('确认 generation 已过期')
    return this.#current.acknowledge(phase, error)
  }

  release(): Promise<void> {
    return this.#enqueue(async () => {
      if (this.#released) return
      this.#released = true
      await this.#releaseCurrent()
      this.#listeners.clear()
    })
  }

  async #startGeneration(
    generation: number,
    requestedStartTime: number,
  ): Promise<MediaSessionSnapshot> {
    if (this.#released) throw new Error('媒体会话已经释放')
    const input: SeekableGenerationFactoryInput = {
      sessionId: this.options.sessionId,
      logicalSourceId: this.options.logicalSourceId,
      mode: this.options.mode,
      generation,
      originalStartTime: this.options.originalStartTime,
      requestedStartTime,
    }
    const handle = this.options.createGeneration(input)
    this.#current = handle
    this.#unsubscribe = handle.subscribe((event) => {
      const eventGeneration =
        event.type === 'generation-changed'
          ? event.generation.generation
          : event.session.activeGeneration
      if (eventGeneration !== this.#current?.generation.generation) return
      for (const listener of this.#listeners) listener(event)
    })
    await handle.start(this.options.createProducer(input))
    return handle.session
  }

  async #releaseCurrent(): Promise<void> {
    const current = this.#current
    this.#current = undefined
    this.#unsubscribe?.()
    this.#unsubscribe = undefined
    await current?.release()
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#operation.then(operation, operation)
    this.#operation = result.catch(() => undefined)
    return result
  }
}
