import type { Subscription } from 'rxjs'
import type {
  MediaEvent,
  MediaPort,
  PlaybackClock,
  PlaybackMediaRestoreState,
  PlaybackMediaSnapshot,
  PlaybackSource,
  PlaybackState,
} from './types'
import { BehaviorSubject } from 'rxjs'
import { isAutoplayBlocked, normalizePlayError } from './errors'

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum)

/**
 * 将媒体后端的离散事件折叠成稳定播放状态，并提供统一命令入口。
 */
export class PlaybackSession {
  private readonly stateSubject = new BehaviorSubject<PlaybackState>({ status: 'idle' })
  private readonly subscription: Subscription
  private source: PlaybackSource | null = null
  private pendingSeekResume = false
  private activeSessionId = 0
  private destroyed = false

  readonly state$ = this.stateSubject.asObservable()
  readonly clock: PlaybackClock

  constructor(private readonly media: MediaPort) {
    this.clock = {
      now: () => this.toLogicalTime(this.media.getSnapshot().currentTime),
      snapshot: () => {
        const value = this.toLogicalSnapshot(this.media.getSnapshot())
        return {
          ...value,
          buffered: value.buffered.map(([start, end]) => [start, end] as const),
        }
      },
    }
    this.subscription = media.events$.subscribe((event) => this.handleMediaEvent(event))
  }

  get currentState(): PlaybackState {
    return this.stateSubject.value
  }

  load(source: PlaybackSource): void {
    if (this.destroyed) return
    const sessionId = ++this.activeSessionId
    if (this.source) this.media.setSource(null, sessionId)
    this.source = source
    this.pendingSeekResume = false
    this.stateSubject.next({ status: 'loading', source })
    this.media.setSource(source, sessionId)
  }

  /** 取消当前媒体但保留 Session，可用于退出当前视频后再次加载。 */
  cancel(): void {
    if (this.destroyed) return
    const sessionId = ++this.activeSessionId
    this.source = null
    this.pendingSeekResume = false
    this.media.setSource(null, sessionId)
    this.stateSubject.next({ status: 'idle' })
  }

  async play(): Promise<void> {
    if (this.destroyed || !this.source) return
    const sessionId = this.activeSessionId
    const source = this.source
    try {
      await this.media.play()
    } catch (cause) {
      if (this.destroyed || sessionId !== this.activeSessionId || source !== this.source) return

      const snapshot = this.media.getSnapshot()
      if (source.autoplay && isAutoplayBlocked(cause)) {
        this.stateSubject.next(this.createTimedState('paused', snapshot))
        return
      }

      this.stateSubject.next({
        status: 'error',
        source,
        error: normalizePlayError(cause),
      })
    }
  }

  pause(): void {
    if (this.destroyed || !this.source) return
    this.media.pause()
  }

  seek(time: number): void {
    if (this.destroyed || !this.source || !Number.isFinite(time)) return

    const mediaSnapshot = this.media.getSnapshot()
    const snapshot = this.toLogicalSnapshot(mediaSnapshot)
    const duration = Number.isFinite(snapshot.duration) ? Math.max(snapshot.duration, 0) : 0
    const targetTime = duration > 0 ? clamp(time, 0, duration) : Math.max(time, 0)
    this.pendingSeekResume = this.currentState.status === 'playing'
    this.stateSubject.next({
      status: 'seeking',
      source: this.source,
      duration,
      targetTime,
      resumeAfterSeek: this.pendingSeekResume,
      rate: mediaSnapshot.rate,
    })
    this.media.seek(this.toElementTime(targetTime, mediaSnapshot.duration))
  }

  setVolume(volume: number): void {
    if (this.destroyed || !Number.isFinite(volume)) return
    this.media.setVolume(clamp(volume, 0, 1))
  }

  setMuted(muted: boolean): void {
    if (this.destroyed) return
    this.media.setMuted(muted)
  }

  setRate(rate: number): void {
    if (this.destroyed || !Number.isFinite(rate) || rate <= 0) return
    this.media.setRate(rate)
  }

  /** 换 transport/generation 后按原始逻辑时间恢复媒体元素状态。 */
  restore(state: PlaybackMediaRestoreState): void {
    if (this.destroyed || !this.source) return
    this.setVolume(state.volume)
    this.setMuted(state.muted)
    this.setRate(state.rate)

    const mediaSnapshot = this.media.getSnapshot()
    const logicalSnapshot = this.toLogicalSnapshot(mediaSnapshot)
    const duration = Math.max(0, logicalSnapshot.duration)
    const targetTime = duration > 0 ? clamp(state.currentTime, 0, duration) : state.currentTime
    const elementTarget = this.toElementTime(targetTime, mediaSnapshot.duration)
    const alreadyAtTarget =
      !mediaSnapshot.seeking && Math.abs(mediaSnapshot.currentTime - elementTarget) < 0.01
    this.pendingSeekResume = !state.paused
    if (alreadyAtTarget) {
      this.pendingSeekResume = false
      this.stateSubject.next(
        this.createTimedState(state.paused ? 'paused' : 'playing', mediaSnapshot),
      )
      if (!state.paused) void this.play()
      return
    }
    this.stateSubject.next({
      status: 'seeking',
      source: this.source,
      duration,
      targetTime,
      resumeAfterSeek: !state.paused,
      rate: state.rate,
    })
    this.media.seek(elementTarget)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    const sessionId = ++this.activeSessionId
    this.source = null
    this.pendingSeekResume = false
    this.subscription.unsubscribe()
    this.media.setSource(null, sessionId)
    this.media.destroy()
    this.stateSubject.next({ status: 'idle' })
    this.stateSubject.complete()
  }

  private handleMediaEvent(event: MediaEvent): void {
    if (this.destroyed || !this.source || event.sessionId !== this.activeSessionId) return

    switch (event.type) {
      case 'load-start':
        this.stateSubject.next({ status: 'loading', source: this.source })
        break
      case 'metadata':
      case 'can-play':
        this.stateSubject.next(
          this.createTimedState(event.snapshot.paused ? 'ready' : 'playing', event.snapshot),
        )
        break
      case 'play':
        this.pendingSeekResume = false
        this.stateSubject.next(this.createTimedState('playing', event.snapshot))
        break
      case 'pause':
        if (this.currentState.status !== 'seeking') {
          this.stateSubject.next(this.createTimedState('paused', event.snapshot))
        }
        break
      case 'time-update':
      case 'rate-change':
        this.updateTimedState(event.snapshot)
        break
      case 'volume-change':
        break
      case 'seeking':
        {
          const snapshot = this.toLogicalSnapshot(event.snapshot)
          this.stateSubject.next({
            status: 'seeking',
            source: this.source,
            duration: snapshot.duration,
            targetTime: snapshot.currentTime,
            resumeAfterSeek: this.pendingSeekResume,
            rate: snapshot.rate,
          })
        }
        break
      case 'seeked': {
        const shouldResume = this.pendingSeekResume
        this.pendingSeekResume = false
        this.stateSubject.next(
          this.createTimedState(shouldResume ? 'playing' : 'paused', event.snapshot),
        )
        if (shouldResume) {
          void this.play()
        }
        break
      }
      case 'ended':
        this.pendingSeekResume = false
        this.stateSubject.next({
          status: 'ended',
          source: this.source,
          duration: this.toLogicalSnapshot(event.snapshot).duration,
          rate: event.snapshot.rate,
        })
        break
      case 'error':
        this.pendingSeekResume = false
        this.stateSubject.next({ status: 'error', source: this.source, error: event.error })
        break
    }
  }

  private createTimedState(
    status: 'ready' | 'playing' | 'paused',
    snapshot: PlaybackMediaSnapshot,
  ): Extract<PlaybackState, { status: 'ready' | 'playing' | 'paused' }> {
    const logical = this.toLogicalSnapshot(snapshot)
    return {
      status,
      source: this.source!,
      duration: logical.duration,
      currentTime: logical.currentTime,
      rate: logical.rate,
    }
  }

  private updateTimedState(snapshot: PlaybackMediaSnapshot): void {
    const { status } = this.currentState
    if (status !== 'ready' && status !== 'playing' && status !== 'paused') return
    this.stateSubject.next(this.createTimedState(status, snapshot))
  }

  private toLogicalTime(elementTime: number): number {
    const offset = this.source?.timeline?.offset ?? this.source?.startTime ?? 0
    const duration = this.source?.timeline?.originalDuration
    const logical = Math.max(0, offset + finiteOr(elementTime, 0))
    return duration && duration > 0 ? clamp(logical, 0, duration) : logical
  }

  private toElementTime(logicalTime: number, elementDuration: number): number {
    const offset = this.source?.timeline?.offset ?? this.source?.startTime ?? 0
    const local = Math.max(0, logicalTime - offset)
    return elementDuration > 0 ? clamp(local, 0, elementDuration) : local
  }

  private toLogicalSnapshot(snapshot: PlaybackMediaSnapshot): PlaybackMediaSnapshot {
    const duration = this.source?.timeline?.originalDuration
    const logicalDuration = duration && duration > 0 ? duration : snapshot.duration
    const offset = this.source?.timeline?.offset ?? this.source?.startTime ?? 0
    return {
      ...snapshot,
      currentTime: this.toLogicalTime(snapshot.currentTime),
      duration: logicalDuration,
      buffered: snapshot.buffered.map(([start, end]) => [
        clamp(offset + start, 0, logicalDuration),
        clamp(offset + end, 0, logicalDuration),
      ]),
    }
  }
}

const finiteOr = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback)
