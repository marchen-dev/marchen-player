/* eslint-disable @typescript-eslint/no-unsafe-function-type */
/**
 * WebCodecs Player
 *
 * 简化版播放器，整合：
 * - MP4 解封装 (mp4box.js)
 * - WebCodecs 解码
 * - Canvas 渲染
 */

import type { AudioTrackInfo,VideoTrackInfo } from './mp4-demuxer'
import {MP4Demuxer } from './mp4-demuxer'
import type { DecodedFrame } from './video-decoder'
import { WebCodecsVideoDecoder } from './video-decoder'
import type { WebGLRenderer } from './video-renderer'
import { Canvas2DRenderer, createRenderer } from './video-renderer'

export interface PlayerOptions {
  container: HTMLElement
  autoPlay?: boolean
  loop?: boolean
  muted?: boolean
}

export interface PlayerState {
  duration: number
  currentTime: number
  isPlaying: boolean
  isBuffering: boolean
  videoInfo: VideoTrackInfo | null
  audioInfo: AudioTrackInfo | null
}

type PlayerEventType =
  | 'ready'
  | 'play'
  | 'pause'
  | 'ended'
  | 'timeupdate'
  | 'error'
  | 'seeking'
  | 'seeked'

export class WebCodecsPlayer {
  private container: HTMLElement
  private canvas: HTMLCanvasElement
  private options: PlayerOptions

  // 核心组件
  private demuxer: MP4Demuxer
  private videoDecoder: WebCodecsVideoDecoder | null = null
  private renderer: Canvas2DRenderer | WebGLRenderer | null = null

  // 状态
  private state: PlayerState = {
    duration: 0,
    currentTime: 0,
    isPlaying: false,
    isBuffering: false,
    videoInfo: null,
    audioInfo: null,
  }

  // 帧缓冲队列
  private frameQueue: DecodedFrame[] = []
  private maxFrameQueueSize = 120 // 约 4 秒缓冲
  private isPaused = false // 解码暂停标志

  // 播放控制
  private playbackStartTime = 0
  private firstFrameTimestamp = -1 // 第一帧的时间戳，用于同步
  private lastFrameTime = 0
  private animationFrameId: number | null = null

  // 事件监听
   
  private eventListeners = new Map<PlayerEventType, Set<Function>>()

  // 性能统计
  private stats = {
    decodedFrames: 0,
    droppedFrames: 0,
    fps: 0,
    lastFpsTime: 0,
    frameCount: 0,
  }

  constructor(options: PlayerOptions) {
    this.options = options
    this.container = options.container

    // 创建 canvas
    this.canvas = document.createElement('canvas')
    this.canvas.style.width = '100%'
    this.canvas.style.height = '100%'
    this.canvas.style.backgroundColor = '#000'
    this.container.append(this.canvas)

    // 创建 demuxer
    this.demuxer = new MP4Demuxer()
    this.setupDemuxer()
  }

  private setupDemuxer() {
    // 当解析到视频信息时
    this.demuxer.onConfigReady(async (video, audio) => {
      this.state.videoInfo = video
      this.state.audioInfo = audio

      if (video) {
        this.state.duration = video.duration

        // 设置 canvas 尺寸
        this.canvas.width = video.codedWidth
        this.canvas.height = video.codedHeight

        // 创建渲染器
        this.renderer = createRenderer({
          canvas: this.canvas,
          width: video.codedWidth,
          height: video.codedHeight,
          preferWebGL: false, // 先用 Canvas 2D，更简单
        })

        // 创建解码器
        this.videoDecoder = new WebCodecsVideoDecoder()
        const success = await this.videoDecoder.configure({
          codec: video.codec,
          codedWidth: video.codedWidth,
          codedHeight: video.codedHeight,
          description: video.description,
          hardwareAcceleration: 'prefer-hardware',
        })

        if (!success) {
          this.emit('error', new Error(`Failed to configure decoder for codec: ${video.codec}`))
          return
        }

        // 设置解码回调
        this.videoDecoder.setFrameCallback((frame) => {
          this.handleDecodedFrame(frame)
        })

        this.videoDecoder.setErrorCallback((error) => {
          this.emit('error', error)
        })

        this.emit('ready', this.state)

        // 自动播放
        if (this.options.autoPlay) {
          this.play()
        }
      }
    })

    // 当解析到 sample 时
    this.demuxer.onSampleReady((sample) => {
      if (sample.type === 'video' && this.videoDecoder) {
        this.stats.decodedFrames++
        this.videoDecoder.decode(sample.data, sample.timestamp, sample.isKeyFrame)
      }
    })

    // 错误处理
    this.demuxer.onErrorOccurred((error) => {
      this.emit('error', error)
    })
  }

  private handleDecodedFrame(decodedFrame: DecodedFrame) {
    // 添加到队列
    this.frameQueue.push(decodedFrame)

    // 按时间戳排序
    this.frameQueue.sort((a, b) => a.timestamp - b.timestamp)

    // 背压控制：队列满时暂停 demuxer
    if (this.frameQueue.length >= this.maxFrameQueueSize && !this.isPaused) {
      this.isPaused = true
      this.demuxer.pause()
    }
  }

  /**
   * 渲染循环
   */
  private renderLoop = () => {
    try {
      if (!this.state.isPlaying) {
        console.warn('[Player] renderLoop: isPlaying is false, stopping')
        return
      }

      const now = performance.now()

      // 如果还没有帧，继续等待
      if (this.frameQueue.length === 0) {
        this.animationFrameId = requestAnimationFrame(this.renderLoop)
        return
      }

      // 记录第一帧的时间戳，用于同步
      if (this.firstFrameTimestamp < 0) {
        this.firstFrameTimestamp = this.frameQueue[0].timestamp
        this.playbackStartTime = now
        console.info(
          '[Player] First frame sync:',
          this.firstFrameTimestamp,
          'queue:',
          this.frameQueue.length,
        )
      }

      // 计算播放时间（相对于第一帧）
      const playbackTime = (now - this.playbackStartTime) * 1000 + this.firstFrameTimestamp

      // 调试：每秒输出一次状态
      if (now - this.stats.lastFpsTime >= 1000) {
        console.info(
          '[Player] Status - queue:',
          this.frameQueue.length,
          'playbackTime:',
          playbackTime,
          'nextFrame:',
          this.frameQueue[0]?.timestamp,
        )
      }

      // 找到应该显示的帧
      let frameToRender: DecodedFrame | null = null

      while (this.frameQueue.length > 0) {
        const frame = this.frameQueue[0]

        if (frame.timestamp <= playbackTime) {
          // 这一帧应该显示了
          frameToRender = this.frameQueue.shift()!

          // 如果还有更早应该显示的帧，跳过它们（丢帧）
          while (this.frameQueue.length > 0 && this.frameQueue[0].timestamp <= playbackTime) {
            const skippedFrame = this.frameQueue.shift()!
            skippedFrame.frame.close()
            this.stats.droppedFrames++
          }

          break
        } else {
          // 还没到显示时间
          break
        }
      }

      // 渲染帧
      if (frameToRender && this.renderer) {
        if (this.renderer instanceof Canvas2DRenderer) {
          this.renderer.render(frameToRender.frame)
        }

        // 更新当前时间
        this.state.currentTime = frameToRender.timestamp / 1_000_000 // 转换为秒
        this.emit('timeupdate', this.state.currentTime)

        // 释放帧资源
        frameToRender.frame.close()

        // FPS 统计
        this.stats.frameCount++
      }

      // 背压控制：队列有空间时恢复 demuxer
      if (this.isPaused && this.frameQueue.length < this.maxFrameQueueSize / 2) {
        this.isPaused = false
        this.demuxer.resume()
      }

      // FPS 统计（移到外面，每秒更新一次）
      if (now - this.stats.lastFpsTime >= 1000) {
        this.stats.fps = this.stats.frameCount
        this.stats.frameCount = 0
        this.stats.lastFpsTime = now
      }

      // 检查是否播放结束
      if (
        this.state.duration > 0 &&
        this.state.currentTime >= this.state.duration &&
        this.frameQueue.length === 0
      ) {
        this.handlePlaybackEnded()
        return
      }

      // 继续下一帧
      this.animationFrameId = requestAnimationFrame(this.renderLoop)
    } catch (error) {
      console.error('[Player] renderLoop error:', error)
      // 即使出错也要继续循环
      this.animationFrameId = requestAnimationFrame(this.renderLoop)
      this.emit('error', error)
    }
  }

  private handlePlaybackEnded() {
    this.state.isPlaying = false
    this.emit('ended')

    if (this.options.loop) {
      this.seek(0)
      this.play()
    }
  }

  // ==================== 公共 API ====================

  /**
   * 加载视频文件
   */
  async load(source: string | File): Promise<void> {
    this.state.isBuffering = true

    try {
      if (typeof source === 'string') {
        await this.demuxer.loadFromUrl(source)
      } else {
        await this.demuxer.loadFromFile(source)
      }
    } catch (error) {
      this.emit('error', error)
      throw error
    } finally {
      this.state.isBuffering = false
    }
  }

  /**
   * 播放
   */
  play(): void {
    if (this.state.isPlaying) return

    this.state.isPlaying = true
    // 重置时间同步，让 renderLoop 重新计算
    this.firstFrameTimestamp = -1

    this.emit('play')
    this.animationFrameId = requestAnimationFrame(this.renderLoop)
  }

  /**
   * 暂停
   */
  pause(): void {
    if (!this.state.isPlaying) return

    this.state.isPlaying = false

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }

    this.emit('pause')
  }

  /**
   * 跳转到指定时间
   */
  async seek(timeInSeconds: number): Promise<void> {
    this.emit('seeking')

    // 暂停播放
    const wasPlaying = this.state.isPlaying
    this.pause()

    // 清空帧队列
    for (const frame of this.frameQueue) {
      frame.frame.close()
    }
    this.frameQueue = []

    // 重置时间同步
    this.firstFrameTimestamp = -1

    // 重置解码器
    this.videoDecoder?.reset()

    // Seek demuxer
    this.demuxer.seek(timeInSeconds)

    // 更新状态
    this.state.currentTime = timeInSeconds

    this.emit('seeked')

    // 如果之前在播放，继续播放
    if (wasPlaying) {
      this.play()
    }
  }

  /**
   * 获取当前时间
   */
  get currentTime(): number {
    return this.state.currentTime
  }

  /**
   * 设置当前时间（seek）
   */
  set currentTime(value: number) {
    this.seek(value)
  }

  /**
   * 获取时长
   */
  get duration(): number {
    return this.state.duration
  }

  /**
   * 是否正在播放
   */
  get paused(): boolean {
    return !this.state.isPlaying
  }

  /**
   * 获取视频信息
   */
  get videoInfo(): VideoTrackInfo | null {
    return this.state.videoInfo
  }

  /**
   * 获取性能统计
   */
  get statistics() {
    return {
      ...this.stats,
      queueSize: this.frameQueue.length,
      decoderQueueSize: this.videoDecoder?.queueSize ?? 0,
    }
  }

  // ==================== 事件系统 ====================

  on(event: PlayerEventType, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }
    this.eventListeners.get(event)!.add(callback)
  }

  off(event: PlayerEventType, callback: Function): void {
    this.eventListeners.get(event)?.delete(callback)
  }

  private emit(event: PlayerEventType, ...args: any[]): void {
    this.eventListeners.get(event)?.forEach((callback) => {
      try {
        callback(...args)
      } catch (e) {
        console.error(`Error in event handler for ${event}:`, e)
      }
    })
  }

  // ==================== 销毁 ====================

  destroy(): void {
    this.pause()

    // 清空帧队列
    for (const frame of this.frameQueue) {
      frame.frame.close()
    }
    this.frameQueue = []

    // 销毁组件
    this.videoDecoder?.close()
    this.renderer?.destroy()
    this.demuxer.destroy()

    // 移除 canvas
    this.canvas.remove()
  }
}
