import type {
  MediaAudioTrack,
  MediaPort,
  PlaybackClock,
  PlaybackError,
  PlaybackMediaRestoreState,
  PlaybackSource,
  PlaybackState,
} from '@marchen/playback-core'
import { PlaybackSession } from '@marchen/playback-core'

export type PlayerRuntimeDisposePhase = 'ui-frame' | 'danmaku' | 'subtitle' | 'observer'
export type PlayerRuntimeDisposer = () => void

interface RuntimeMediaPort extends MediaPort {
  waitForTransportReady?: () => Promise<void>
  waitForPlayableData?: () => Promise<void>
}

export interface PlayerRuntimeCommands {
  play: () => Promise<void>
  pause: () => void
  seek: (time: number) => void
  setVolume: (volume: number) => void
  setMuted: (muted: boolean) => void
  setRate: (rate: number) => void
  restore: (state: PlaybackMediaRestoreState) => void
  cancel: () => void
}

export type PlaybackCommandIntent =
  | { type: 'play' | 'pause' }
  | { type: 'seek'; time: number }
  | { type: 'rate'; rate: number }
  | { type: 'volume'; volume: number }
  | { type: 'muted'; muted: boolean }

/** Renderer 播放器的组合根，负责会话、资源阶段和 source 的所有权。 */
export class PlayerRuntime {
  private commandListener?: (intent: PlaybackCommandIntent) => void
  private internalCommand = false
  private readonly session: PlaybackSession
  private readonly disposers: Record<PlayerRuntimeDisposePhase, PlayerRuntimeDisposer[]> = {
    'ui-frame': [],
    danmaku: [],
    subtitle: [],
    observer: [],
  }
  private sourceLease: { release: () => void } | null = null
  private destroyed = false
  private audioControl?: {
    getTracks: () => { tracks: readonly MediaAudioTrack[]; selectedId?: number }
    select: (id: number) => Promise<void>
  }

  readonly clock: PlaybackClock
  readonly commands: PlayerRuntimeCommands

  constructor(
    private readonly media: RuntimeMediaPort,
    private readonly onDisposeError: (error: unknown) => void = console.error,
  ) {
    this.session = new PlaybackSession(media)
    this.clock = this.session.clock
    this.commands = {
      play: () => {
        this.notifyCommand({ type: 'play' })
        return this.session.play()
      },
      pause: () => {
        this.notifyCommand({ type: 'pause' })
        this.session.pause()
      },
      seek: (time) => {
        this.notifyCommand({ type: 'seek', time })
        this.session.seek(time)
      },
      setVolume: (volume) => {
        this.notifyCommand({ type: 'volume', volume })
        this.session.setVolume(volume)
      },
      setMuted: (muted) => {
        this.notifyCommand({ type: 'muted', muted })
        this.session.setMuted(muted)
      },
      setRate: (rate) => {
        this.notifyCommand({ type: 'rate', rate })
        this.session.setRate(rate)
      },
      restore: (state) => this.session.restore(state),
      cancel: () => this.cancel(),
    }
  }

  onCommand(listener: ((intent: PlaybackCommandIntent) => void) | undefined) {
    this.commandListener = listener
  }
  /** 内核恢复沿用公开命令，但不能被误判成新的用户意图。 */
  restoreCommands<T>(run: () => T): T {
    const previous = this.internalCommand
    this.internalCommand = true
    try {
      return run()
    } finally {
      this.internalCommand = previous
    }
  }
  private notifyCommand(intent: PlaybackCommandIntent) {
    if (!this.internalCommand) this.commandListener?.(intent)
  }

  setAudioControl(control: typeof this.audioControl) {
    this.audioControl = control
  }
  get audioTracks() {
    return this.audioControl?.getTracks() ?? this.media.getAudioTracks?.() ?? { tracks: [] }
  }
  async selectAudioTrack(id: number) {
    if (this.audioControl) return this.audioControl.select(id)
    if (!this.media.selectAudioTrack) throw new Error('音轨切换不可用')
    await this.media.selectAudioTrack(id)
  }

  get presentation() {
    return this.media.getPresentation?.()
  }

  get state(): PlaybackState {
    return this.session.currentState
  }

  get playbackInfo() {
    return this.media.getPresentation?.()
  }

  fail(error: PlaybackError): void {
    this.session.failSourceSeek(error)
  }

  retryBlockedAutoplay(): void {
    if (this.session.shouldRetryAutoplay) void this.session.play()
  }

  subscribe(listener: () => void): () => void {
    const subscription = this.session.state$.subscribe(listener)
    return () => subscription.unsubscribe()
  }

  load(source: PlaybackSource, lease?: { release: () => void }): void {
    if (this.destroyed) {
      lease?.release()
      return
    }
    const previous = this.sourceLease
    this.sourceLease = lease ?? null
    this.session.load(source)
    if (previous) this.safeDispose(previous.release)
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
    if (!this.sourceLease) return
    const lease = this.sourceLease
    this.sourceLease = null
    this.safeDispose(lease.release)
  }

  private safeDispose(disposer: PlayerRuntimeDisposer): void {
    try {
      disposer()
    } catch (error) {
      this.onDisposeError(error)
    }
  }
}
