import type { PlaybackState } from '@marchen/playback-core'
import type { DB_History } from '@renderer/database/schemas/history'
import type { PlayerRuntime } from '../runtime'

export interface PlaybackHistoryRepository {
  get: (hash: string) => Promise<DB_History | undefined>
  update: (hash: string, changes: Partial<DB_History>) => PromiseLike<unknown>
}

export interface PlaybackHistoryAdapterOptions {
  runtime: PlayerRuntime
  hash: string
  repository: PlaybackHistoryRepository
  markWatched: (animeId: number, episodeId: number) => Promise<void>
  now?: () => number
  saveIntervalMs?: number
  onError?: (error: unknown) => void
}

/**
 * 把高频媒体时钟转换为低频 HISTORY 写入。
 * adapter 不持有 React 生命周期，换片和退出时由宿主显式 dispose。
 */
export class PlaybackHistoryAdapter {
  private readonly now: () => number
  private readonly saveIntervalMs: number
  private readonly onError: (error: unknown) => void
  private unsubscribe: (() => void) | null = null
  private restored = false
  private disposed = false
  private lastSavedAt = Number.NEGATIVE_INFINITY
  private watched = false
  private lastStatus: PlaybackState['status'] = 'idle'

  constructor(private readonly options: PlaybackHistoryAdapterOptions) {
    this.now = options.now ?? Date.now
    this.saveIntervalMs = options.saveIntervalMs ?? 2000
    this.onError = options.onError ?? console.error
  }

  start(): void {
    if (this.unsubscribe || this.disposed) return
    this.unsubscribe = this.options.runtime.subscribe(() => this.handleState(this.options.runtime.state))
    void this.restore()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.unsubscribe?.()
    this.unsubscribe = null
    if (this.restored) void this.persist(this.options.runtime.state, true)
  }

  private async restore(): Promise<void> {
    try {
      const record = await this.options.repository.get(this.options.hash)
      if (this.disposed) return
      const progress = finitePositive(record?.progress)
      const duration = finitePositive(record?.duration)
      const completed = isCompleted(progress, duration)
      if (!completed && progress > 0) this.options.runtime.commands.seek(progress)
      this.restored = true
      if (completed) void this.markAsWatched()
    } catch (error) {
      this.restored = true
      this.onError(error)
    }
  }

  private handleState(state: PlaybackState): void {
    if (!this.restored || this.disposed || !hasTimeline(state)) return
    if (state.status === 'ended') {
      void this.persist(state, true)
      void this.markAsWatched()
      this.lastStatus = state.status
      return
    }

    const progress = timelineProgress(state)
    if (isCompleted(progress, state.duration)) void this.markAsWatched()
    void this.persist(state, state.status === 'paused' && this.lastStatus !== 'paused')
    this.lastStatus = state.status
  }

  private async persist(state: PlaybackState, force: boolean): Promise<void> {
    if (!hasTimeline(state)) return
    const now = this.now()
    if (!force && now - this.lastSavedAt < this.saveIntervalMs) return
    this.lastSavedAt = now
    const duration = finitePositive(state.duration)
    const progress = state.status === 'ended' ? duration : timelineProgress(state)
    try {
      await this.options.repository.update(this.options.hash, {
        progress,
        duration,
        updatedAt: new Date().toISOString(),
      })
    } catch (error) {
      this.onError(error)
    }
  }

  private async markAsWatched(): Promise<void> {
    if (this.watched) return
    this.watched = true
    try {
      const record = await this.options.repository.get(this.options.hash)
      if (record?.animeId && record.episodeId) {
        await this.options.markWatched(record.animeId, record.episodeId)
      }
    } catch (error) {
      this.onError(error)
    }
  }
}

const hasTimeline = (
  state: PlaybackState,
): state is Extract<PlaybackState, { duration: number }> => 'duration' in state

const timelineProgress = (state: Extract<PlaybackState, { duration: number }>) => {
  if (state.status === 'ended') return finitePositive(state.duration)
  if (state.status === 'seeking') return finitePositive(state.targetTime)
  return finitePositive(state.currentTime)
}

const finitePositive = (value: number | undefined) =>
  Number.isFinite(value) ? Math.max(0, value ?? 0) : 0

export const isCompleted = (progress: number, duration: number) =>
  duration > 0 && progress / duration >= 0.9
