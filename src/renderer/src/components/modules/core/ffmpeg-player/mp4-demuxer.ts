/**
 * MP4 Demuxer - 使用 mp4box.js 解封装
 *
 * 这是最简单的方案：用现成的 mp4box.js 做解封装，
 * 然后用 WebCodecs 做解码
 */

import type { ISOFile, Movie, Sample, Track } from 'mp4box'
import { createFile, DataStream, Endianness, MP4BoxBuffer } from 'mp4box'

export interface VideoTrackInfo {
  id: number
  codec: string
  codedWidth: number
  codedHeight: number
  displayWidth: number
  displayHeight: number
  description?: Uint8Array // avcC/hvcC box for decoder config
  frameRate: number
  duration: number
}

export interface AudioTrackInfo {
  id: number
  codec: string
  sampleRate: number
  numberOfChannels: number
  description?: Uint8Array
  duration: number
}

export interface DemuxedSample {
  type: 'video' | 'audio'
  timestamp: number // 微秒
  duration: number // 微秒
  data: Uint8Array
  isKeyFrame: boolean
}

export class MP4Demuxer {
  private mp4File: ISOFile
  private videoTrack: VideoTrackInfo | null = null
  private audioTrack: AudioTrackInfo | null = null

  private onConfig?: (video: VideoTrackInfo | null, audio: AudioTrackInfo | null) => void
  private onSample?: (sample: DemuxedSample) => void
  private onError?: (error: Error) => void

  constructor() {
    this.mp4File = createFile()
    this.setupCallbacks()
  }

  private setupCallbacks() {
    // 解析到 moov box 后触发，获取视频信息
    this.mp4File.onReady = (info: Movie) => {

      // 提取视频轨道信息
      const videoTrack = info.tracks.find((t) => t.type === 'video')
      if (videoTrack?.video) {
        this.videoTrack = {
          id: videoTrack.id,
          codec: videoTrack.codec,
          codedWidth: videoTrack.video.width,
          codedHeight: videoTrack.video.height,
          displayWidth: videoTrack.video.width,
          displayHeight: videoTrack.video.height,
          frameRate: videoTrack.nb_samples / (videoTrack.duration / videoTrack.timescale),
          duration: videoTrack.duration / videoTrack.timescale,
          description: this.getCodecDescription(videoTrack),
        }

        // 设置提取视频 samples - 每次只提取 100 个
        this.mp4File.setExtractionOptions(videoTrack.id, 'video', {
          nbSamples: 100,
        })
      }

      // 提取音频轨道信息
      const audioTrack = info.tracks.find((t) => t.type === 'audio')
      if (audioTrack?.audio) {
        this.audioTrack = {
          id: audioTrack.id,
          codec: audioTrack.codec,
          sampleRate: audioTrack.audio.sample_rate,
          numberOfChannels: audioTrack.audio.channel_count,
          duration: audioTrack.duration / audioTrack.timescale,
          description: this.getCodecDescription(audioTrack),
        }

        this.mp4File.setExtractionOptions(audioTrack.id, 'audio', {
          nbSamples: Infinity,
        })
      }

      this.onConfig?.(this.videoTrack, this.audioTrack)

      // 开始提取 samples
      this.mp4File.start()
    }

    // 提取到 samples 后触发
    this.mp4File.onSamples = (_trackId: number, user: unknown, samples: Sample[]) => {
      const isVideo = user === 'video'

      for (const sample of samples) {
        const demuxedSample: DemuxedSample = {
          type: isVideo ? 'video' : 'audio',
          timestamp: (sample.cts * 1_000_000) / sample.timescale, // 转换为微秒
          duration: (sample.duration * 1_000_000) / sample.timescale,
          data: new Uint8Array(sample.data!),
          isKeyFrame: sample.is_sync,
        }

        this.onSample?.(demuxedSample)
      }
    }

    this.mp4File.onError = (module: string, message: string) => {
      this.onError?.(new Error(`${module}: ${message}`))
    }
  }

  /**
   * 获取 codec description (avcC/hvcC box)
   * WebCodecs 需要这个来初始化解码器
   */
  private getCodecDescription(track: Track): Uint8Array | undefined {
    const trak = this.mp4File.getTrackById(track.id)
    if (!trak) return undefined

    // 遍历 stsd 找到 avcC/hvcC/esds 等 box
     
    for (const entry of (trak as any).mdia.minf.stbl.stsd.entries) {
      // H.264
      if (entry.avcC) {
        const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN)
        entry.avcC.write(stream)
        return new Uint8Array(stream.buffer, 8) // 跳过 box header
      }
      // H.265
      if (entry.hvcC) {
        const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN)
        entry.hvcC.write(stream)
        return new Uint8Array(stream.buffer, 8)
      }
      // VP9
      if (entry.vpcC) {
        const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN)
        entry.vpcC.write(stream)
        return new Uint8Array(stream.buffer, 8)
      }
      // AV1
      if (entry.av1C) {
        const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN)
        entry.av1C.write(stream)
        return new Uint8Array(stream.buffer, 8)
      }
      // AAC
      if (entry.esds) {
        const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN)
        entry.esds.write(stream)
        return new Uint8Array(stream.buffer, 8)
      }
    }

    return undefined
  }

  /**
   * 设置回调
   */
  onConfigReady(callback: (video: VideoTrackInfo | null, audio: AudioTrackInfo | null) => void) {
    this.onConfig = callback
  }

  onSampleReady(callback: (sample: DemuxedSample) => void) {
    this.onSample = callback
  }

  onErrorOccurred(callback: (error: Error) => void) {
    this.onError = callback
  }

  /**
   * 追加数据
   */
  appendBuffer(buffer: ArrayBuffer, offset = 0) {
    const mp4Buffer = MP4BoxBuffer.fromArrayBuffer(buffer, offset)
    this.mp4File.appendBuffer(mp4Buffer)
  }

  /**
   * 从 File 加载
   */
  async loadFromFile(file: File): Promise<void> {
    const reader = file.stream().getReader()
    let offset = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      this.appendBuffer(value.buffer as ArrayBuffer, offset)
      offset += value.byteLength
    }

    this.mp4File.flush()
  }

  /**
   * 从 URL 加载
   */
  async loadFromUrl(url: string): Promise<void> {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`)
    }

    const reader = response.body!.getReader()
    let offset = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      this.appendBuffer(value.buffer as ArrayBuffer, offset)
      offset += value.byteLength
    }

    this.mp4File.flush()
  }

  /**
   * Seek 到指定时间
   */
  seek(timeInSeconds: number) {
    const info = this.mp4File.seek(timeInSeconds, true)
    return info
  }

  /**
   * 暂停提取 samples
   */
  pause() {
    this.mp4File.stop()
  }

  /**
   * 恢复提取 samples
   */
  resume() {
    this.mp4File.start()
  }

  /**
   * 释放资源
   */
  destroy() {
    this.mp4File.stop()
    this.mp4File.flush()
  }
}
