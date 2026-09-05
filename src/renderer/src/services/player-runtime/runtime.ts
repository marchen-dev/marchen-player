import type {
  MediaPort,
  PlaybackClock,
  PlaybackMediaRestoreState,
  PlaybackSource,
  PlaybackState,
} from '@marchen/playback-core'
import type { PlaybackSourceLease, PlaybackSourceLeaseDescriptor } from '@marchen/shared/media'
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

/** Renderer 播放器的组合根，负责会话、资源阶段和 source 的所有权。 */
export class PlayerRuntime {
  private readonly session: PlaybackSession
  private readonly disposers: Record<PlayerRuntimeDisposePhase, PlayerRuntimeDisposer[]> = {
    'ui-frame': [],
    danmaku: [],
    subtitle: [],
    observer: [],
  }
  private sourceLease: PlaybackSourceLease | null = null
  private generationSeek = 0
  private seekIntent?: PlaybackMediaRestoreState
  private clearSeekDeadline?: () => void
  private destroyed = false
  private heartbeatTimer?: ReturnType<typeof setInterval>

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
        if (this.seekIntent) this.seekIntent.paused = false
        return this.session.play()
      },
      pause: () => {
        if (this.seekIntent) this.seekIntent.paused = true
        this.session.pause()
      },
      seek: (time) => this.seek(time),
      setVolume: (volume) => {
        if (this.seekIntent && Number.isFinite(volume))
          this.seekIntent.volume = Math.min(1, Math.max(0, volume))
        this.session.setVolume(volume)
      },
      setMuted: (muted) => {
        if (this.seekIntent) this.seekIntent.muted = muted
        this.session.setMuted(muted)
      },
      setRate: (rate) => {
        if (this.seekIntent && Number.isFinite(rate) && rate > 0) this.seekIntent.rate = rate
        this.session.setRate(rate)
      },
      restore: (state) => this.session.restore(state),
      cancel: () => this.cancel(),
    }
  }

  get state(): PlaybackState {
    return this.session.currentState
  }

  get playbackMode(): PlaybackSourceLease['mode'] | undefined {
    return this.sourceLease?.mode
  }

  get playbackInfo(): PlaybackSourceLeaseDescriptor | undefined {
    if (!this.sourceLease) return undefined
    const {
      release: _release,
      seek: _seek,
      markAttaching: _attaching,
      markPlayable: _playable,
      markFailed: _failed,
      reportPlayback: _reportPlayback,
      ...descriptor
    } = this.sourceLease
    return structuredClone(descriptor)
  }

  retryBlockedAutoplay(): void {
    if (this.session.shouldRetryAutoplay) void this.session.play()
  }

  subscribe(listener: () => void): () => void {
    const subscription = this.session.state$.subscribe(listener)
    return () => subscription.unsubscribe()
  }

  load(source: PlaybackSource, lease?: PlaybackSourceLease): void {
    if (this.destroyed) return
    this.clearSeekDeadline?.()
    this.releaseSource()
    this.seekIntent = undefined
    this.sourceLease = lease ?? null
    this.generationSeek += 1
    this.session.load(source)
    if (lease?.reportPlayback) {
      const report = () => lease.reportPlayback?.(this.clock.now())
      report()
      this.heartbeatTimer = setInterval(report, 5_000)
    }
  }

  cancel(): void {
    if (this.destroyed) return
    this.clearSeekDeadline?.()
    this.session.cancel()
    this.seekIntent = undefined
    this.generationSeek += 1
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
    this.clearSeekDeadline?.()
    this.generationSeek += 1

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
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = undefined
    if (!this.sourceLease) return
    const lease = this.sourceLease
    this.sourceLease = null
    this.safeDispose(lease.release)
  }

  private seek(time: number): void {
    const lease = this.sourceLease
    const state = this.session.currentState
    if (lease?.hlsSessionMode === 'stable-vod' && Number.isFinite(time)) {
      this.clearSeekDeadline?.()
      this.session.seek(time)
      if (this.session.currentState.status !== 'seeking') return
      let unsubscribe: (() => void) | undefined
      const timer = setTimeout(() => {
        cleanup()
        // setSource(null) 销毁 HLS controller，主动中止 HTTP，Gateway 不再等满 10 秒。
        this.session.failSourceSeek({
          code: 'unknown',
          message: '跳转恢复超过 5 秒，请重新加载视频',
          recoverable: true,
        })
        this.releaseSource()
      }, 5_000)
      const cleanup = () => {
        clearTimeout(timer)
        unsubscribe?.()
        unsubscribe = undefined
      }
      // seek 后旧缓冲仍可能派发 canplay；只有目标 seeked 才能证明这次跳转完成。
      const target = Math.max(0, Math.min(time, lease.timeline.originalDuration || Infinity))
      const subscription = this.media.events$.subscribe((event) => {
        if (
          event.type === 'seeked' &&
          !event.snapshot.seeking &&
          Math.abs(event.snapshot.currentTime - target) < 0.25
        )
          cleanup()
      })
      unsubscribe = () => subscription.unsubscribe()
      this.clearSeekDeadline = cleanup
      return
    }
    if (!lease?.seek || !('source' in state) || !state.source || !Number.isFinite(time)) {
      this.session.seek(time)
      return
    }
    const source = state.source
    this.seekIntent ??= { ...this.clock.snapshot() }
    const targetTime = Math.max(0, time)
    this.session.beginSourceSeek(targetTime)
    const request = ++this.generationSeek
    this.clearSeekDeadline?.()
    let expired = false
    const isCurrent = () =>
      !expired && !this.destroyed && request === this.generationSeek && lease === this.sourceLease
    // 恢复超时只结束本次 UI 操作；迟到 descriptor 不得重新挂载媒体。
    const timer = setTimeout(() => {
      if (!isCurrent()) return
      expired = true
      this.session.failSourceSeek({
        code: 'unknown',
        message: '跳转恢复超时，请重试',
        recoverable: true,
      })
    }, 5_000)
    this.clearSeekDeadline = () => clearTimeout(timer)
    void lease
      .seek(targetTime)
      .then(async (descriptor) => {
        if (!isCurrent()) return
        this.session.load({
          ...source,
          url: descriptor.url,
          mimeType: descriptor.mimeType,
          timeline: descriptor.timeline,
          autoplay: false,
        })
        await this.media.waitForTransportReady?.()
        if (!isCurrent()) return
        await this.media.waitForPlayableData?.()
        if (!isCurrent()) return
        this.session.restore({ ...this.seekIntent!, currentTime: targetTime })
        this.seekIntent = undefined
      })
      .catch((error) => {
        if (!isCurrent()) return
        this.session.failSourceSeek({
          code: 'unknown',
          message: '跳转失败，请重试或重新加载视频',
          recoverable: true,
          cause: error,
        })
        this.onDisposeError(error)
      })
      .finally(() => clearTimeout(timer))
  }

  private safeDispose(disposer: PlayerRuntimeDisposer): void {
    try {
      disposer()
    } catch (error) {
      this.onDisposeError(error)
    }
  }
}
