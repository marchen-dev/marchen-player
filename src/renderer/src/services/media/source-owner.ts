import type { SubtitleSource } from './subtitles/matroska'
import { ALL_FORMATS, BlobSource, CustomSource, Input } from 'mediabunny'
import { MediaMetadata } from './metadata'

export type SharedMediaSource =
  { kind: 'web'; file: File } | { kind: 'electron'; source: SubtitleSource; release: () => void }

export interface MediaSourceLease {
  readonly input: Input
  readonly metadata: MediaMetadata
  readonly source: SubtitleSource
  readonly signal: AbortSignal
  release: () => void
}

/** Input 和平台资源只有一个 owner；消费者释放只取消自己，最后一个租约才关闭来源。 */
export class MediaSourceOwner {
  private readonly controller = new AbortController()
  private readonly input: Input
  private readonly source: SubtitleSource
  private readonly metadata: MediaMetadata
  private references = 0
  private closed = false

  constructor(private readonly descriptor: SharedMediaSource) {
    this.source =
      descriptor.kind === 'web'
        ? {
            size: descriptor.file.size,
            read: async (start, end, signal) => {
              signal?.throwIfAborted()
              const data = new Uint8Array(await descriptor.file.slice(start, end).arrayBuffer())
              signal?.throwIfAborted()
              return data
            },
          }
        : descriptor.source
    this.input = new Input({
      formats: ALL_FORMATS,
      source:
        descriptor.kind === 'web'
          ? new BlobSource(descriptor.file, { maxCacheSize: 32 * 1024 * 1024 })
          : new CustomSource({
              getSize: () => this.source.size,
              maxCacheSize: 32 * 1024 * 1024,
              read: (start, end) => this.read(start, end, this.controller.signal),
            }),
    })
    this.metadata = new MediaMetadata(this.input)
  }

  acquire(): MediaSourceLease {
    if (this.closed) throw new Error('媒体来源已关闭')
    this.references++
    const local = new AbortController()
    const signal = AbortSignal.any([this.controller.signal, local.signal])
    let released = false
    return {
      input: this.input,
      metadata: this.metadata,
      source: {
        size: this.source.size,
        read: (start, end, requestSignal) =>
          this.read(start, end, requestSignal ? AbortSignal.any([signal, requestSignal]) : signal),
      },
      signal,
      release: () => {
        if (released) return
        released = true
        local.abort()
        this.references--
        if (!this.references) this.close()
      },
    }
  }

  /** 切源时可强制关闭所有租约；迟到读取不会再返回给消费者。 */
  close() {
    if (this.closed) return
    this.closed = true
    this.controller.abort()
    try {
      this.input.dispose()
    } finally {
      if (this.descriptor.kind === 'electron') this.descriptor.release()
    }
  }

  private async read(start: number, end: number, signal: AbortSignal) {
    signal.throwIfAborted()
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end < start ||
      end > this.source.size
    )
      throw new Error('媒体读取范围越界')
    if (end - start > 32 * 1024 * 1024) throw new Error('单次媒体读取超过 32 MiB')
    const data = await this.source.read(start, end, signal)
    signal.throwIfAborted()
    if (data.byteLength !== end - start) throw new Error('媒体短读或文件已变化')
    return data
  }
}
