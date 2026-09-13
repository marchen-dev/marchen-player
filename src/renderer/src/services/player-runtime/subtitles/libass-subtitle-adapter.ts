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
  const instance = new Constructor(options) as LibassInstance & {
    worker: Worker | null
    workerError: (error: unknown) => void
  }
  // 库默认在 onError 后自行 dispose 并抛全局错误，宿主随后会再次使用已清空的 Worker。
  // 在唯一接入边界接管错误事件，让 adapter 负责释放和字幕降级。
  instance.worker?.removeEventListener('error', instance.workerError)
  instance.workerError = (error) => {
    if (error instanceof ErrorEvent) error.preventDefault()
    options.onError(error)
  }
  instance.worker?.addEventListener('error', instance.workerError)
  return instance
}

/** libass-wasm 的唯一生命周期入口，确保换轨与销毁会释放上一轨资源。 */
export class LibassSubtitleAdapter {
  private instance: LibassInstance | null = null
  private releaseTrack: (() => void) | null = null
  private disposed = false
  private generation = 0
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

  setTrack(url: string, release?: () => void, fonts: readonly string[] = []): boolean {
    if (this.disposed) {
      release?.()
      return false
    }

    // 字体是实例初始化资源，换字体必须先销毁旧 Worker，再撤销其 URL。
    const fontsChanged =
      fonts.length !== this.fonts.length || fonts.some((font, index) => font !== this.fonts[index])
    if (fontsChanged) {
      this.dropInstance()
    }
    this.releaseCurrentTrack()
    this.fonts = [...fonts]
    this.releaseTrack = release ?? null
    try {
      if (!this.instance) {
        const generation = ++this.generation
        const instance = this.createInstance({
          canvas: this.canvas,
          subUrl: url,
          fonts: [NotoSansSC, ...fonts],
          fallbackFont: NotoSansSC,
          workerUrl,
          legacyWorkerUrl,
          // 偏移由共用时钟同步时应用一次，库不再绑定 video。
          timeOffset: 0,
          onReady: () => {
            if (this.disposed || generation !== this.generation) return
            this.resize()
            this.sync(true)
          },
          onError: (error) => this.fail(error, generation),
        })
        if (this.disposed || generation !== this.generation) {
          try { instance.dispose() } catch { /* 初始化失败可能已清空 Worker。 */ }
          return false
        }
        this.instance = instance
      } else {
        this.instance.freeTrack()
        this.instance.setTrackByUrl(url)
      }
      this.sync(true)
      return this.instance !== null
    } catch (error) {
      this.fail(error, this.generation)
      throw error
    }
  }

  close(): void {
    if (this.disposed) return
    this.withInstance((instance) => instance.freeTrack())
    this.releaseCurrentTrack()
  }

  setTimeOffset(offset: number): void {
    this.timeOffset = Number.isFinite(offset) ? offset : 0
    this.sync(true)
  }

  resize(): void {
    if (!this.disposed) {
      this.withInstance((instance) => instance.resize(this.canvas.width, this.canvas.height))
      this.sync(true)
    }
  }

  /** 由宿主统一驱动；暂停时不让字幕自己的墙上时钟继续前进。 */
  sync(force = false): void {
    if (this.disposed || !this.instance) return
    this.withInstance((instance) => {
      const snapshot = this.clock.snapshot()
      const time = this.clock.now() + this.timeOffset
      const paused = snapshot.paused || snapshot.seeking
      if (force || snapshot.rate !== this.lastRate) instance.setRate(snapshot.rate)
      if (force || paused !== this.lastPaused) instance.setIsPaused(paused, time)
      if (force || Math.abs(time - this.lastTime) >= 1 / 60 || !Number.isFinite(this.lastTime)) {
        instance.setCurrentTime(time)
        this.lastTime = time
      }
      this.lastRate = snapshot.rate
      this.lastPaused = paused
    })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.dropInstance()
    this.releaseCurrentTrack()
  }

  private dropInstance(): void {
    const instance = this.instance
    this.instance = null
    this.generation++
    try { instance?.dispose() } catch { /* Worker 已崩溃或由库释放时，清理仍须幂等。 */ }
  }

  private withInstance(action: (instance: LibassInstance) => void): void {
    const instance = this.instance
    const generation = this.generation
    if (!instance || this.disposed) return
    try { action(instance) } catch (error) { this.fail(error, generation) }
  }

  private fail(error: unknown, generation: number): void {
    if (this.disposed || generation !== this.generation) return
    this.dropInstance()
    this.releaseCurrentTrack()
    // 清除失败前最后一次画出的字幕，避免它留在后续视频画面上。
    const width = this.canvas.width
    this.canvas.width = width
    const message = error instanceof Error ? error.message
      : typeof ErrorEvent !== 'undefined' && error instanceof ErrorEvent
        ? error.message || '字幕 Worker 运行失败'
        : typeof Event !== 'undefined' && error instanceof Event
          ? '字幕 Worker 加载或执行失败，请查看开发者工具中的错误详情'
          : String(error)
    this.onError(new Error(message))
  }

  private releaseCurrentTrack(): void {
    const release = this.releaseTrack
    this.releaseTrack = null
    release?.()
  }
}
