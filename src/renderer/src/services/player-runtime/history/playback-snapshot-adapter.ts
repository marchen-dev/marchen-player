import type { PlaybackState } from '@marchen/playback-core'
import type { DurableMediaSource } from '@marchen/shared/media'
import type { SnapshotPort } from '../platform'
import type { PlayerRuntime } from '../runtime'
import type { PlaybackHistoryRepository } from './playback-history-adapter'

export interface PlaybackSnapshotAdapterOptions {
  runtime: PlayerRuntime
  hash: string
  source: DurableMediaSource
  snapshot: SnapshotPort
  repository: PlaybackHistoryRepository
  onError?: (error: unknown) => void
}

/** 双端历史缩略图观察者；退出时取消后台读取，不再另起解码。 */
export class PlaybackSnapshotAdapter {
  private unsubscribe: (() => void) | null = null
  private metadataCaptured = false
  private disposed = false
  private readonly controller = new AbortController()

  constructor(private readonly options: PlaybackSnapshotAdapterOptions) {}

  start(): void {
    if (this.unsubscribe || this.disposed) return
    this.unsubscribe = this.options.runtime.subscribe(() => {
      const state = this.options.runtime.state
      if (!this.metadataCaptured && hasDuration(state) && state.duration > 0) {
        this.metadataCaptured = true
        void this.capture(state.duration / 2)
      }
    })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.unsubscribe?.()
    this.unsubscribe = null
    this.controller.abort()
  }

  private async capture(time: number): Promise<void> {
    try {
      const thumbnail = await this.options.snapshot.capture({
        source: this.options.source,
        time: Math.max(0, time),
        signal: this.controller.signal,
      })
      if (this.disposed) return
      await this.options.repository.update(this.options.hash, { thumbnail })
    } catch (error) {
      if (
        this.controller.signal.aborted ||
        (error instanceof DOMException && error.name === 'AbortError')
      )
        return
      ;(this.options.onError ?? console.error)(error)
    }
  }
}

const hasDuration = (state: PlaybackState): state is Extract<PlaybackState, { duration: number }> =>
  'duration' in state
