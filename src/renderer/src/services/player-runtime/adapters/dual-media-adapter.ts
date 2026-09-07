import type { MediaEvent, MediaPort, PlaybackSource } from '@marchen/playback-core'
import type { Subscription } from 'rxjs'
import { Subject } from 'rxjs'

type Engine = 'native' | 'canvas'
export interface ReadyMediaPort extends MediaPort {
  waitForPlayableData: () => Promise<void>
  waitForTransportReady?: () => Promise<void>
}

/** 会话只绑定这一个 Port；先取消旧事件、停止旧内核，再让新内核接管输出。 */
export class DualMediaAdapter implements ReadyMediaPort {
  private readonly subject = new Subject<MediaEvent>()
  readonly events$ = this.subject.asObservable()
  private active?: ReadyMediaPort
  private subscription?: Subscription
  private destroyed = false
  private controls = { volume: 1, muted: false, rate: 1 }

  constructor(
    private readonly create: (engine: Engine) => ReadyMediaPort,
    private readonly onEngine: (engine: Engine | null) => void,
    private readonly getVideoFrameRate: () => number | undefined = () => undefined,
  ) {}

  setSource(source: PlaybackSource | null, sessionId: number) {
    this.subscription?.unsubscribe()
    this.subscription = undefined
    this.active?.destroy()
    this.active = undefined
    if (!source || this.destroyed) {
      this.onEngine(null)
      return
    }
    const engine = source.engine ?? 'native'
    const media = (this.active = this.create(engine))
    media.setVolume(this.controls.volume)
    media.setMuted(this.controls.muted)
    media.setRate(this.controls.rate)
    this.subscription = media.events$.subscribe((event) => this.subject.next(event))
    this.onEngine(engine)
    media.setSource(source, sessionId)
  }

  getPresentation = () => ({
    ...(this.active?.getPresentation?.() ?? {
      engine: 'native' as const,
      backend: 'unknown' as const,
      firstFrame: false,
      buffering: false,
      width: 0,
      height: 0,
    }),
    videoFrameRate: this.active ? this.getVideoFrameRate() : undefined,
  })
  getSnapshot = () =>
    this.active?.getSnapshot() ?? {
      ...this.controls,
      currentTime: 0,
      duration: 0,
      paused: true,
      seeking: false,
      ended: false,
      buffered: [],
    }
  getAudioTracks = () => this.active?.getAudioTracks?.() ?? { tracks: [] }
  selectAudioTrack = async (id: number) => {
    if (!this.active?.selectAudioTrack) throw new Error('当前内核不支持切换音轨')
    await this.active.selectAudioTrack(id)
  }
  waitForPlayableData = () => this.active?.waitForPlayableData() ?? Promise.resolve()
  waitForTransportReady = () => this.active?.waitForTransportReady?.() ?? Promise.resolve()
  play = () => this.active?.play() ?? Promise.resolve()
  pause = () => this.active?.pause()
  seek = (time: number) => this.active?.seek(time)
  setVolume = (volume: number) => {
    this.controls.volume = volume
    this.active?.setVolume(volume)
  }
  setMuted = (muted: boolean) => {
    this.controls.muted = muted
    this.active?.setMuted(muted)
  }
  setRate = (rate: number) => {
    this.controls.rate = rate
    this.active?.setRate(rate)
  }
  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    this.setSource(null, 0)
    this.subject.complete()
  }
}
