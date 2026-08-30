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

/** Electron 截图观察者；失败只记录，不改变播放状态。 */
export class PlaybackSnapshotAdapter {
  private unsubscribe: (() => void) | null = null
  private metadataCaptured = false
  private disposed = false
  private lastStatus: PlaybackState['status'] = 'idle'

  constructor(private readonly options: PlaybackSnapshotAdapterOptions) {}

  start(): void {
    if (this.unsubscribe || this.disposed) return
    this.unsubscribe = this.options.runtime.subscribe(() => {
      const state = this.options.runtime.state
      if (!this.metadataCaptured && hasDuration(state) && state.duration > 0) {
        this.metadataCaptured = true
        void this.capture(state.duration / 2)
      }
      this.lastStatus = state.status
    })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.unsubscribe?.()
    this.unsubscribe = null
    const state = this.options.runtime.state
    if (!hasDuration(state) || state.duration <= 0 || this.lastStatus === 'idle') return
    const currentTime =
      state.status === 'ended' ? Math.max(0, state.duration - 3) : currentTimeOf(state)
    void this.capture(currentTime)
  }

  private async capture(time: number): Promise<void> {
    try {
      const thumbnail = await this.options.snapshot.capture({
        source: this.options.source,
        time: Math.max(0, time),
      })
      await this.options.repository.update(this.options.hash, { thumbnail })
    } catch (error) {
      ;(this.options.onError ?? console.error)(error)
    }
  }
}

const hasDuration = (state: PlaybackState): state is Extract<PlaybackState, { duration: number }> =>
  'duration' in state

const currentTimeOf = (state: Extract<PlaybackState, { duration: number }>) => {
  if (state.status === 'seeking') return state.targetTime
  if (state.status === 'ended') return state.duration
  return state.currentTime
}
