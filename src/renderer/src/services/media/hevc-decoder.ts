import type { EncodedPacket, VideoCodec } from 'mediabunny'
import type { HevcMemoryStats, Runtime } from './hevc-runtime'
import { CustomVideoDecoder, VideoSample } from 'mediabunny'
import { loadHevcRuntime } from './hevc-runtime'

export interface HevcDiagnostics {
  configuredThreads: number
  mode: string | null
  memory: HevcMemoryStats | null
  pendingTimestamps: number
}

export interface HevcDecoderOptions {
  onDecoded?: () => void
  onDiagnostics?: (value: HevcDiagnostics) => void
  /** 版本化静态资源目录，必须由应用资源配置提供。 */
  assetBase: string
  threads: 1 | 2 | 4
  /** 调用方先完成异步 WebCodecs 探测；未确认需要软解的配置不得匹配。 */
  shouldDecode: (config: VideoDecoderConfig) => boolean
}

// libav 的低位参数使用有符号 i32，负时间戳和超过 2^32 微秒的长片都不能截断高位。
const splitTime = (seconds: number) => {
  const value = Math.round(seconds * 1e6)
  if (!Number.isSafeInteger(value)) throw new Error('视频时间戳超出支持范围')
  return [value | 0, Math.floor(value / 0x100000000)] as const
}

/** 供媒体 Worker 注册；不在 UI 线程解码，也不在模块导入时抢占原生解码器。 */
export function createHevcDecoder(options: HevcDecoderOptions) {
  return class HevcDecoder extends CustomVideoDecoder {
    private runtime?: Runtime
    private handles?: [number, number, number, number]
    private closed = false
    private pending: Promise<void> = Promise.resolve()
    private closing?: Promise<void>
    private failure?: unknown
    private durations = new Map<number, number>()
    private lastDiagnostics = -Infinity

    // 关闭先阻止发布，再等待已发出的调用返回，不能在 ff_init_decoder 未返回时终止其运行时。
    private enqueue(action: () => Promise<void>) {
      const operation = this.pending.then(async () => {
        if (this.closed) return
        if (this.failure) throw this.failure
        await action()
      })
      this.pending = operation.catch((error) => {
        this.failure = error
      })
      return operation
    }

    static override supports(codec: VideoCodec, config: VideoDecoderConfig) {
      return codec === 'hevc' && options.shouldDecode(config)
    }

    init() {
      return this.enqueue(() => this.initialize())
    }

    private async initialize() {
      if (typeof document !== 'undefined') throw new Error('HEVC 软件解码必须运行在媒体 Worker')
      if (options.threads > 1 && !globalThis.crossOriginIsolated)
        throw new Error('多线程解码需要跨源隔离')
      const runtime = await loadHevcRuntime(options.assetBase, options.threads)
      if (this.closed) {
        runtime.terminate()
        return
      }
      this.runtime = runtime
      try {
        this.handles = await runtime.ff_init_decoder('hevc', {
          threads: options.threads,
          codecpar: {
            codec_type: 0,
            width: this.config.codedWidth,
            height: this.config.codedHeight,
            // 有 description 时保留 hvcC；没有时由解码器处理 Annex B 参数集。
            extradata: this.config.description
              ? new Uint8Array(
                  ArrayBuffer.isView(this.config.description)
                    ? this.config.description.buffer.slice(
                        this.config.description.byteOffset,
                        this.config.description.byteOffset + this.config.description.byteLength,
                      )
                    : this.config.description,
                )
              : undefined,
          },
          time_base: [1, 1000000],
        })
      } catch (error) {
        runtime.terminate()
        this.runtime = undefined
        throw error
      }
    }

    decode(packet: EncodedPacket) {
      return this.enqueue(() => this.decodePacket(packet))
    }

    private async decodePacket(packet: EncodedPacket) {
      const [pts, ptshi] = splitTime(packet.timestamp)
      const [duration, durationhi] = splitTime(packet.duration)
      if (this.durations.size >= 128) throw new Error('HEVC 待输出帧超过预算')
      this.durations.set(Math.round(packet.timestamp * 1e6), packet.duration)
      await this.output(
        [
          {
            data: packet.data,
            pts,
            ptshi,
            duration,
            durationhi,
            // MediaBunny 按解码顺序供包，无 DTS 时保留未知值，不把 B 帧 PTS 冒充 DTS。
            dts: 0,
            dtshi: -2147483648,
            flags: packet.type === 'key' ? 1 : 0,
            time_base_num: 1,
            time_base_den: 1000000,
          },
        ],
        false,
      )
    }

    flush() {
      return this.enqueue(async () => {
        await this.output([], true)
        this.durations.clear()
      })
    }

    private async output(packets: unknown[], fin: boolean) {
      if (this.closed) return
      if (!this.runtime || !this.handles) throw new Error('HEVC 解码器未初始化')
      const [, context, packet, frame] = this.handles
      const frames = await this.runtime.ff_decode_multi(context, packet, frame, packets, {
        fin,
        copyoutFrame: 'video',
      })
      if (this.closed) return
      this.reportDiagnostics()
      for (const value of frames) {
        if (this.closed) return
        // 固定 FFmpeg 9.0 构建的枚举，升级产物必须重新验证此映射。
        const format = value.format === 0 ? 'I420' : value.format === 62 ? 'I420P10' : null
        if (!format) throw new Error(`尚不支持该 HEVC 像素格式：${value.format}`)
        const timestamp =
          (((value.pts >>> 0) + value.ptshi * 0x100000000) * value.time_base_num) /
          value.time_base_den
        if (!Number.isFinite(timestamp)) throw new Error('无效的解码帧时间戳')
        const durationKey = Math.round(timestamp * 1e6)
        const duration = this.durations.get(durationKey) ?? 0
        this.durations.delete(durationKey)
        const { top, bottom, left, right } = value.crop
        const sample = new VideoSample(value.data, {
          format,
          codedWidth: value.width,
          codedHeight: value.height,
          layout: value.layout,
          timestamp,
          duration,
          colorSpace: this.config.colorSpace,
          visibleRect: {
            left,
            top,
            width: value.width - left - right,
            height: value.height - top - bottom,
          },
        })
        try {
          options.onDecoded?.()
          this.onSample(sample)
        } catch (error) {
          sample.close()
          throw error
        }
      }
    }

    private reportDiagnostics() {
      const now = performance.now()
      if (options.onDiagnostics && now - this.lastDiagnostics >= 1000) {
        this.lastDiagnostics = now
        options.onDiagnostics(this.getDiagnostics())
      }
    }

    getDiagnostics() {
      return {
        configuredThreads: options.threads,
        mode: this.runtime?.libavjsMode ?? null,
        memory: this.runtime?.libavjsMemoryStats?.() ?? null,
        pendingTimestamps: this.durations.size,
      }
    }

    close() {
      if (this.closing) return this.closing
      this.closed = true
      this.closing = this.dispose()
      return this.closing
    }

    private async dispose() {
      await this.pending
      const runtime = this.runtime
      this.runtime = undefined
      try {
        if (runtime && this.handles)
          await runtime.ff_free_decoder(...(this.handles.slice(1) as [number, number, number]))
      } finally {
        this.handles = undefined
        this.durations.clear()
        runtime?.terminate()
      }
    }
  }
}
