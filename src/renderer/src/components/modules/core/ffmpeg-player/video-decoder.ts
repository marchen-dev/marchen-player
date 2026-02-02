/**
 * WebCodecs 视频解码器
 *
 * 优先使用 WebCodecs 硬解，如果不支持则需要降级到 WASM
 */

import type { VideoTrackInfo } from './mp4-demuxer'

export interface DecodedFrame {
  frame: VideoFrame
  timestamp: number // 微秒
}

export interface VideoDecoderConfig {
  codec: string
  codedWidth: number
  codedHeight: number
  description?: Uint8Array
  hardwareAcceleration?: 'prefer-hardware' | 'prefer-software' | 'no-preference'
}

export class WebCodecsVideoDecoder {
  private decoder: VideoDecoder | null = null
  private pendingFrames: DecodedFrame[] = []
  private config: VideoDecoderConfig | null = null
  private needsKeyFrame = true // 是否需要等待关键帧

  private onFrame?: (frame: DecodedFrame) => void
  private onError?: (error: Error) => void

  private decodePromiseResolve?: () => void
  private frameCount = 0
  private isConfigured = false

  /**
   * 检查 WebCodecs 是否支持指定 codec
   */
  static async isSupported(config: VideoDecoderConfig): Promise<boolean> {
    if (!('VideoDecoder' in window)) {
      console.warn('[VideoDecoder] WebCodecs not supported in this browser')
      return false
    }

    try {
      const support = await VideoDecoder.isConfigSupported({
        codec: config.codec,
        codedWidth: config.codedWidth,
        codedHeight: config.codedHeight,
        description: config.description,
        hardwareAcceleration: config.hardwareAcceleration || 'prefer-hardware',
      })

      return support.supported ?? false
    } catch (e) {
      console.error('[VideoDecoder] isConfigSupported error:', e)
      return false
    }
  }

  /**
   * 从轨道信息创建解码器配置
   */
  static fromTrackInfo(track: VideoTrackInfo): VideoDecoderConfig {
    return {
      codec: track.codec,
      codedWidth: track.codedWidth,
      codedHeight: track.codedHeight,
      description: track.description,
      hardwareAcceleration: 'prefer-hardware',
    }
  }

  /**
   * 配置解码器
   */
  async configure(config: VideoDecoderConfig): Promise<boolean> {
    this.config = config

    // 检查支持性
    const supported = await WebCodecsVideoDecoder.isSupported(config)
    if (!supported) {
      console.error('[VideoDecoder] Codec not supported:', config.codec)
      return false
    }

    // 创建解码器
    this.decoder = new VideoDecoder({
      output: (frame) => {
        this.handleDecodedFrame(frame)
      },
      error: (error) => {
        this.onError?.(error)
      },
    })

    // 配置解码器
    try {
      this.decoder.configure({
        codec: config.codec,
        codedWidth: config.codedWidth,
        codedHeight: config.codedHeight,
        description: config.description,
        hardwareAcceleration: config.hardwareAcceleration || 'prefer-hardware',
      })

      this.isConfigured = true
      return true
    } catch (e) {
      console.error('[VideoDecoder] Configure error:', e)
      return false
    }
  }

  private handleDecodedFrame(frame: VideoFrame) {
    this.frameCount++

    const decodedFrame: DecodedFrame = {
      frame,
      timestamp: frame.timestamp ?? 0,
    }

    if (this.onFrame) {
      this.onFrame(decodedFrame)
    } else {
      this.pendingFrames.push(decodedFrame)
    }
  }

  /**
   * 设置帧输出回调
   */
  setFrameCallback(callback: (frame: DecodedFrame) => void) {
    this.onFrame = callback

    // 输出之前积压的帧
    while (this.pendingFrames.length > 0) {
      const frame = this.pendingFrames.shift()!
      callback(frame)
    }
  }

  /**
   * 设置错误回调
   */
  setErrorCallback(callback: (error: Error) => void) {
    this.onError = callback
  }

  /**
   * 解码一个 chunk
   */
  decode(data: Uint8Array, timestamp: number, isKeyFrame: boolean) {
    if (!this.decoder || this.decoder.state !== 'configured') {
      console.warn('[VideoDecoder] Decoder not ready')
      return
    }

    // 如果需要关键帧但当前不是关键帧，跳过
    if (this.needsKeyFrame && !isKeyFrame) {
      return
    }

    // 遇到关键帧后，清除标志
    if (isKeyFrame) {
      this.needsKeyFrame = false
    }

    const chunk = new EncodedVideoChunk({
      type: isKeyFrame ? 'key' : 'delta',
      timestamp,
      data,
    })

    try {
      this.decoder.decode(chunk)
    } catch (e) {
      this.onError?.(e as Error)
    }
  }

  /**
   * 等待所有帧解码完成
   */
  async flush(): Promise<void> {
    if (!this.decoder) return

    await this.decoder.flush()
  }

  /**
   * 重置解码器（用于 seek）
   */
  reset() {
    if (!this.decoder) return

    this.decoder.reset()
    this.needsKeyFrame = true

    // 清空积压的帧
    for (const frame of this.pendingFrames) {
      frame.frame.close()
    }
    this.pendingFrames = []

    // 重新配置
    if (this.config) {
      this.decoder.configure({
        codec: this.config.codec,
        codedWidth: this.config.codedWidth,
        codedHeight: this.config.codedHeight,
        description: this.config.description,
        hardwareAcceleration: this.config.hardwareAcceleration || 'prefer-hardware',
      })
    }
  }

  /**
   * 获取解码器状态
   */
  get state(): string {
    return this.decoder?.state ?? 'closed'
  }

  /**
   * 获取待解码队列大小
   */
  get queueSize(): number {
    return this.decoder?.decodeQueueSize ?? 0
  }

  /**
   * 关闭解码器
   */
  close() {
    if (this.decoder) {
      this.decoder.close()
      this.decoder = null
    }

    // 释放所有帧
    for (const frame of this.pendingFrames) {
      frame.frame.close()
    }
    this.pendingFrames = []
    this.isConfigured = false
  }
}

/**
 * 解码器工厂
 * 根据 codec 选择合适的解码器
 */
export const DecoderFactory = {
  /**
   * 创建视频解码器
   * 优先 WebCodecs，不支持时降级到 WASM
   */
  async createVideoDecoder(
    track: VideoTrackInfo,
    options?: { preferSoftware?: boolean },
  ): Promise<WebCodecsVideoDecoder | null> {
    const config = WebCodecsVideoDecoder.fromTrackInfo(track)

    if (options?.preferSoftware) {
      config.hardwareAcceleration = 'prefer-software'
    }

    // 尝试 WebCodecs
    const webCodecsDecoder = new WebCodecsVideoDecoder()
    const success = await webCodecsDecoder.configure(config)

    if (success) {
      return webCodecsDecoder
    }

    // WebCodecs 不支持，需要 WASM 降级
    console.warn('[DecoderFactory] WebCodecs not supported, need WASM fallback')
    console.warn('[DecoderFactory] WASM decoder not implemented yet')

    // TODO: 返回 WASM 解码器
    // return new WasmVideoDecoder(config)

    return null
  },
}
