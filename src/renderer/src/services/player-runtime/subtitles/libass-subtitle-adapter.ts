import SubtitlesOctopus from '@jellyfin/libass-wasm'
import legacyWorkerUrl from '@jellyfin/libass-wasm/dist/js/subtitles-octopus-worker-legacy.js?url'
import workerUrl from '@jellyfin/libass-wasm/dist/js/subtitles-octopus-worker.js?url'
import NotoSansSC from '@renderer/styles/fonts/notoSansSC-medium.woff2?url'

export interface LibassInstance {
  timeOffset: number
  setTrackByUrl: (url: string) => void
  freeTrack: () => void
  resize: () => void
  dispose: () => void
}

interface LibassOptions {
  video: HTMLVideoElement
  subUrl: string
  fonts: string[]
  fallbackFont: string
  workerUrl: string
  legacyWorkerUrl: string
  timeOffset: number
  onError: (error: unknown) => void
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

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly onError: (error: unknown) => void = console.error,
    private readonly createInstance: LibassInstanceFactory = createDefaultInstance,
  ) {}

  setTrack(url: string, release?: () => void): void {
    if (this.disposed) {
      release?.()
      return
    }

    this.releaseCurrentTrack()
    try {
      if (!this.instance) {
        this.instance = this.createInstance({
          video: this.video,
          subUrl: url,
          fonts: [NotoSansSC],
          fallbackFont: NotoSansSC,
          workerUrl,
          legacyWorkerUrl,
          timeOffset: this.timeOffset,
          onError: this.onError,
        })
      } else {
        this.instance.freeTrack()
        this.instance.setTrackByUrl(url)
      }
      this.releaseTrack = release ?? null
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
    if (this.instance) this.instance.timeOffset = this.timeOffset
  }

  resize(): void {
    if (!this.disposed) this.instance?.resize()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.releaseCurrentTrack()
    this.instance?.dispose()
    this.instance = null
  }

  private releaseCurrentTrack(): void {
    const release = this.releaseTrack
    this.releaseTrack = null
    release?.()
  }
}
