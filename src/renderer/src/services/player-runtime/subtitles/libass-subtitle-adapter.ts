import type { PlaybackClock } from '@marchen/playback-core'
import SubtitlesOctopus from '@jellyfin/libass-wasm'
import legacyWorkerUrl from '@jellyfin/libass-wasm/dist/js/subtitles-octopus-worker-legacy.js?url'
import workerUrl from '@jellyfin/libass-wasm/dist/js/subtitles-octopus-worker.js?url'
import NotoSansSC from '@renderer/styles/fonts/notoSansSC-medium.woff2?url'

export interface LibassInstance {
  timeOffset: number
  setTrackByUrl: (url: string) => void
  freeTrack: () => void
  resize: (width: number, height: number) => void
  setCurrentTime: (time: number) => void
  setIsPaused: (paused: boolean, time: number) => void
  setRate: (rate: number) => void
  dispose: () => void
}

interface LibassOptions {
  canvas: HTMLCanvasElement
  subUrl: string
  fonts: string[]
  fallbackFont: string
  workerUrl: string
  legacyWorkerUrl: string
  timeOffset: number
  onError: (error: unknown) => void
  onReady: () => void
}

export type LibassInstanceFactory = (options: LibassOptions) => LibassInstance

const createDefaultInstance: LibassInstanceFactory = (options) => {
  const Constructor = SubtitlesOctopus as unknown as new (value: LibassOptions) => LibassInstance
  return new Constructor(options)
}

/** libass-wasm 的唯一生命周期入口，确保换轨与销毁会释放上一轨资源。 */
export class LibassSubtitleAdapter {
  private instance: LibassInstance | null = null
  private releaseTrack: (() => void) | null = null
  private disposed = false
  private timeOffset = 0
  private fonts: readonly string[] = []
  private lastTime = NaN
  private lastPaused?: boolean
  private lastRate?: number

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly clock: PlaybackClock,
    private readonly onError: (error: unknown) => void = console.error,
    private readonly createInstance: LibassInstanceFactory = createDefaultInstance,
  ) {}

  setTrack(url: string, release?: () => void, fonts: readonly string[] = []): void {
    if (this.disposed) {
      release?.()
      return
    }

    // 字体是实例初始化资源，换字体必须先销毁旧 Worker，再撤销其 URL。
    const fontsChanged =
      fonts.length !== this.fonts.length || fonts.some((font, index) => font !== this.fonts[index])
    if (fontsChanged) {
      this.instance?.dispose()
      this.instance = null
    }
    this.releaseCurrentTrack()
    this.fonts = [...fonts]
    try {
      if (!this.instance) {
        this.instance = this.createInstance({
          canvas: this.canvas,
          subUrl: url,
          fonts: [NotoSansSC, ...fonts],
          fallbackFont: NotoSansSC,
          workerUrl,
          legacyWorkerUrl,
          // 偏移由共用时钟同步时应用一次，库不再绑定 video。
          timeOffset: 0,
          onReady: () => {
            this.resize()
            this.sync(true)
          },
          onError: this.onError,
        })
      } else {
        this.instance.freeTrack()
        this.instance.setTrackByUrl(url)
      }
      this.releaseTrack = release ?? null
      this.sync(true)
    } catch (error) {
      release?.()
      this.onError(error)
      throw error
    }
  }

  close(): void {
    if (this.disposed) return
    this.instance?.freeTrack()
    this.releaseCurrentTrack()
  }

  setTimeOffset(offset: number): void {
    this.timeOffset = Number.isFinite(offset) ? offset : 0
    this.sync(true)
  }

  resize(): void {
    if (!this.disposed) {
      this.instance?.resize(this.canvas.width, this.canvas.height)
      this.sync(true)
    }
  }

  /** 由宿主统一驱动；暂停时不让字幕自己的墙上时钟继续前进。 */
  sync(force = false): void {
    if (this.disposed || !this.instance) return
    const snapshot = this.clock.snapshot()
    const time = this.clock.now() + this.timeOffset
    const paused = snapshot.paused || snapshot.seeking
    if (force || snapshot.rate !== this.lastRate) this.instance.setRate(snapshot.rate)
    if (force || paused !== this.lastPaused) this.instance.setIsPaused(paused, time)
    if (force || Math.abs(time - this.lastTime) >= 1 / 60 || !Number.isFinite(this.lastTime)) {
      this.instance.setCurrentTime(time)
      this.lastTime = time
    }
    this.lastRate = snapshot.rate
    this.lastPaused = paused
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.instance?.dispose()
    this.releaseCurrentTrack()
    this.instance = null
  }

  private releaseCurrentTrack(): void {
    const release = this.releaseTrack
    this.releaseTrack = null
    release?.()
  }
}
