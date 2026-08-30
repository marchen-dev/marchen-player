import type {
  MediaPort,
  PlaybackClock,
  PlaybackSource,
  PlaybackState,
} from '@marchen/playback-core'
import { PlaybackSession } from '@marchen/playback-core'

export type PlayerRuntimeDisposePhase = 'ui-frame' | 'danmaku' | 'subtitle' | 'observer'
export type PlayerRuntimeDisposer = () => void
export type SourceRelease = () => void

export interface PlayerRuntimeCommands {
  play: () => Promise<void>
  pause: () => void
  seek: (time: number) => void
  setVolume: (volume: number) => void
  setMuted: (muted: boolean) => void
  setRate: (rate: number) => void
  cancel: () => void
}

/** Renderer 播放器的组合根，负责会话、资源阶段和 source 的所有权。 */
export class PlayerRuntime {
  private readonly session: PlaybackSession
  private readonly disposers: Record<PlayerRuntimeDisposePhase, PlayerRuntimeDisposer[]> = {
    'ui-frame': [],
    danmaku: [],
    subtitle: [],
    observer: [],
  }
  private sourceRelease: SourceRelease | null = null
  private destroyed = false

  readonly clock: PlaybackClock
  readonly commands: PlayerRuntimeCommands

  constructor(media: MediaPort, private readonly onDisposeError: (error: unknown) => void = console.error) {
    this.session = new PlaybackSession(media)
    this.clock = this.session.clock
    this.commands = {
      play: () => this.session.play(),
      pause: () => this.session.pause(),
      seek: (time) => this.session.seek(time),
      setVolume: (volume) => this.session.setVolume(volume),
      setMuted: (muted) => this.session.setMuted(muted),
      setRate: (rate) => this.session.setRate(rate),
      cancel: () => this.cancel(),
    }
  }

  get state(): PlaybackState {
    return this.session.currentState
  }

  subscribe(listener: () => void): () => void {
    const subscription = this.session.state$.subscribe(listener)
    return () => subscription.unsubscribe()
  }

  load(source: PlaybackSource, release?: SourceRelease): void {
    if (this.destroyed) return
    this.releaseSource()
    this.sourceRelease = release ?? null
    this.session.load(source)
  }

  cancel(): void {
    if (this.destroyed) return
    this.session.cancel()
    this.releaseSource()
  }

  registerDisposer(phase: PlayerRuntimeDisposePhase, disposer: PlayerRuntimeDisposer): () => void {
    if (this.destroyed) {
      this.safeDispose(disposer)
      return () => {}
    }

    const list = this.disposers[phase]
    list.push(disposer)
    return () => {
      const index = list.indexOf(disposer)
      if (index >= 0) list.splice(index, 1)
    }
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true

    this.disposePhase('ui-frame')
    this.disposePhase('danmaku')
    this.disposePhase('subtitle')
    this.disposePhase('observer')
    this.session.destroy()
    this.releaseSource()
  }

  private disposePhase(phase: PlayerRuntimeDisposePhase): void {
    const list = this.disposers[phase]
    for (let index = list.length - 1; index >= 0; index -= 1) {
      this.safeDispose(list[index]!)
    }
    list.length = 0
  }

  private releaseSource(): void {
    if (!this.sourceRelease) return
    const release = this.sourceRelease
    this.sourceRelease = null
    this.safeDispose(release)
  }

  private safeDispose(disposer: PlayerRuntimeDisposer): void {
    try {
      disposer()
    } catch (error) {
      this.onDisposeError(error)
    }
  }
}
