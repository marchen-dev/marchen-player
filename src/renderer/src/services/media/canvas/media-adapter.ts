import type {
  MediaAudioTrack,
  MediaEvent,
  MediaPort,
  MediaPresentation,
  PlaybackMediaSnapshot,
  PlaybackSource,
} from '@marchen/playback-core'
import type { SoundTouchNode } from '@soundtouchjs/audio-worklet'
import type { CanvasReply, CanvasSource } from './protocol'
import { Subject } from 'rxjs'
import { closeAudioStretch, createAudioStretch } from './audio-stretch'
import { CanvasDecoderClient } from './client'
import { CanvasFrameRenderer, HdrFrameLayoutError } from './frame-renderer'

type VideoReply = Extract<CanvasReply, { type: 'video' }>
type AudioReply = Extract<CanvasReply, { type: 'audio' }>
export interface CanvasResource {
  source: CanvasSource
  assetBase: string
  release: () => void
  forceSoftware?: boolean
  audioTrackId?: number
}

/** 媒体时钟和可呈现帧由适配器负责；Worker 只按请求解码，不自行推进播放时间。 */
export class CanvasMediaAdapter implements MediaPort {
  private readonly subject = new Subject<MediaEvent>()
  readonly events$ = this.subject.asObservable()
  private client?: CanvasDecoderClient
  private resource?: CanvasResource
  private context?: AudioContext
  private gain?: GainNode
  private stretch?: SoundTouchNode
  private stretchDelay = 0
  private readonly nodes = new Set<AudioBufferSourceNode>()
  private readonly renderer: CanvasFrameRenderer
  private ready = Promise.resolve()
  private epoch = 0
  private sessionId = 0
  private destroyed = false
  private playing?: Promise<void>
  private playIntent = 0
  private raf = 0
  private audioTimer?: ReturnType<typeof setTimeout>
  private nextVideo?: VideoReply
  private nextAudio?: AudioReply
  private videoBusy = false
  private audioBusy = false
  private audioTracks: MediaAudioTrack[] = []
  private selectedAudioTrackId?: number
  private requestedAudioTrackId?: number
  private hasAudio = false
  private startTime = 0
  private audioEnded = false
  private videoEnded = false
  private resetOnPlay = false
  private reusePausedAudio = false
  private pauseReady = Promise.resolve()
  private resumeAfterSeek = false
  private anchorMedia = 0
  private anchorClock = 0
  private audioEnd = 0
  private lastTimeEvent = 0
  private lastTick = 0
  private lastMediaTime = 0
  private presentation: MediaPresentation = {
    engine: 'canvas',
    backend: 'unknown',
    firstFrame: false,
    buffering: false,
    width: 0,
    height: 0,
  }
  private snapshot: PlaybackMediaSnapshot = {
    currentTime: 0,
    duration: 0,
    volume: 1,
    muted: false,
    rate: 1,
    paused: true,
    seeking: false,
    ended: false,
    buffered: [],
  }

  constructor(
    canvas: HTMLCanvasElement,
    private readonly resolveResource: (id: string) => Promise<CanvasResource>,
  ) {
    this.renderer = new CanvasFrameRenderer(canvas)
    navigator.mediaDevices?.addEventListener('devicechange', this.onDeviceChange)
  }
  private readonly onDeviceChange = () => {
    // 输出设备变更后旧设备延迟不再可靠；暂停并在用户继续时重建音频上下文。
    if (this.hasAudio && !this.snapshot.paused) this.pause()
    this.resetOnPlay = true
  }
  setSource(source: PlaybackSource | null, sessionId: number) {
    this.clear()
    this.sessionId = sessionId
    if (!source || this.destroyed) return
    if (source.engine !== 'canvas') throw new Error('Canvas 内核需要媒体资源标识')
    const epoch = this.epoch
    this.emit('load-start')
    this.ready = this.open(source.resourceId, source.startTime ?? 0, epoch).catch((error) => {
      if (epoch === this.epoch) this.fail(error)
      throw error
    })
    void this.ready.catch(() => {})
  }
  private async open(id: string, time: number, epoch: number, softwareFallback = false) {
    const resource = await this.resolveResource(id)
    if (epoch !== this.epoch) {
      resource.release()
      return
    }
    this.resource = resource
    const client = (this.client = new CanvasDecoderClient())
    const reply = await client.request({
      type: 'open',
      source: resource.source,
      assetBase: resource.assetBase,
      forceSoftware: resource.forceSoftware || softwareFallback,
      audioTrackId: resource.audioTrackId,
    })
    if (epoch !== this.epoch) return
    if (reply.type !== 'ready') throw new Error('媒体初始化响应无效')
    this.startTime = reply.startTime
    time = Math.max(this.startTime, Math.min(time, reply.duration))
    this.hasAudio = reply.hasAudio
    this.audioTracks = reply.audioTracks
    this.selectedAudioTrackId = reply.selectedAudioTrackId
    this.requestedAudioTrackId = reply.selectedAudioTrackId
    this.snapshot = {
      ...this.snapshot,
      currentTime: time,
      duration: reply.duration,
      paused: true,
      seeking: false,
      ended: false,
    }
    this.presentation = {
      ...this.presentation,
      width: reply.width,
      height: reply.height,
      backend: reply.backend,
      videoCodec: reply.videoCodec ?? undefined,
      fallbackReason: softwareFallback ? 'HDR 硬解帧布局不可读，已使用软件解码' : undefined,
      decodeThreads: reply.threads,
      audioOutputChannels: reply.hasAudio ? 2 : 0,
    }
    try {
      await this.position(time, epoch)
    } catch (error) {
      if (epoch !== this.epoch) throw error
      if (
        !softwareFallback &&
        reply.backend === 'webcodecs' &&
        reply.videoCodec === 'hevc' &&
        error instanceof HdrFrameLayoutError
      ) {
        client.close()
        resource.release()
        this.resource = undefined
        return this.open(id, time, epoch, true)
      }
      throw error
    }
    if (epoch !== this.epoch) return
    this.emit('metadata')
    this.emit('can-play')
  }
  waitForPlayableData() {
    return this.ready
  }
  waitForTransportReady() {
    return this.ready
  }
  getAudioTracks() {
    return { tracks: this.audioTracks, selectedId: this.selectedAudioTrackId }
  }
  async selectAudioTrack(id: number) {
    if (!this.audioTracks.some((track) => track.id === id)) throw new Error('指定音轨不存在')
    if (id === this.requestedAudioTrackId) return this.ready
    this.requestedAudioTrackId = id
    this.seek(this.getSnapshot().currentTime)
    await this.ready
    if (this.requestedAudioTrackId !== id) throw new DOMException('音轨切换已取消', 'AbortError')
  }
  getPresentation() {
    return {
      ...this.presentation,
      decodeFps: this.client?.decodeFps,
      colorOutput: this.presentation.firstFrame ? this.renderer.colorOutput : undefined,
    }
  }
  getSnapshot(): PlaybackMediaSnapshot {
    let time = this.snapshot.currentTime
    if (!this.snapshot.paused && !this.snapshot.seeking) {
      time = this.anchorMedia + (this.heardClock() - this.anchorClock) * this.snapshot.rate
      if (this.hasAudio && !this.audioEnded) time = Math.min(time, this.audioEnd)
      time = Math.max(this.snapshot.currentTime, Math.min(this.snapshot.duration, time))
    }
    return {
      ...this.snapshot,
      currentTime: time,
      buffered: this.hasAudio && this.audioEnd > time ? [[time, this.audioEnd]] : [],
    }
  }
  private heardClock() {
    if (!this.context) return this.clock()
    const output = this.context.getOutputTimestamp()
    const audible =
      output.performanceTime && output.contextTime
        ? Math.min(
            this.context.currentTime,
            output.contextTime + (performance.now() - output.performanceTime) / 1000,
          )
        : this.context.currentTime - (this.context.outputLatency || 0)
    return audible - this.stretchDelay
  }
  private async setupAudio(epoch: number) {
    const previous = this.context
    closeAudioStretch(this.stretch)
    this.stretch = undefined
    if (previous && previous.state !== 'closed') await previous.close().catch(() => {})
    if (epoch !== this.epoch) return
    const context = (this.context = new AudioContext())
    context.onstatechange = () => {
      if (
        this.context === context &&
        !this.snapshot.paused &&
        context.state !== 'running' &&
        context.state !== 'closed'
      ) {
        this.pause()
        this.resetOnPlay = true
      }
    }
    await context.suspend()
    const stretch = await createAudioStretch(context, this.snapshot.rate)
    if (epoch !== this.epoch) {
      closeAudioStretch(stretch.node)
      await context.close().catch(() => {})
      return
    }
    this.stretch = stretch.node
    this.stretchDelay = stretch.delay
    this.gain = context.createGain()
    this.stretch.connect(this.gain)
    this.gain.connect(context.destination)
    this.updateGain()
  }
  private clock() {
    return this.context?.currentTime ?? performance.now() / 1000
  }
  play(): Promise<void> {
    if (this.playing) return this.playing
    const intent = ++this.playIntent
    const pending = this.startPlay(intent).finally(() => {
      if (this.playing === pending) this.playing = undefined
    })
    this.playing = pending
    return pending
  }
  private async startPlay(intent: number) {
    await this.ready
    if (intent !== this.playIntent) return
    if (this.destroyed || !this.client || !this.snapshot.paused) return
    const epoch = this.epoch
    if (this.snapshot.ended) {
      this.snapshot.currentTime = this.startTime
      this.snapshot.ended = false
      this.resetOnPlay = true
    }
    await this.pauseReady
    if (epoch !== this.epoch || intent !== this.playIntent) return
    const reuseAudioClock = this.reusePausedAudio && !this.resetOnPlay && this.hasAudio
    this.reusePausedAudio = false
    if (this.resetOnPlay) {
      this.stopScheduling()
      await this.position(this.snapshot.currentTime, epoch)
    }
    if (epoch !== this.epoch) return
    await this.context?.resume()
    if (epoch !== this.epoch || intent !== this.playIntent) return
    if (!reuseAudioClock) {
      this.anchorMedia = this.snapshot.currentTime
      this.anchorClock = this.clock() + (this.hasAudio ? 0.03 : 0)
    }
    this.snapshot.paused = false
    this.resetOnPlay = false
    this.lastTick = performance.now()
    this.lastMediaTime = this.snapshot.currentTime
    this.emit('play')
    void this.pumpAudio(epoch)
    this.tick(epoch)
  }
  pause() {
    this.resumeAfterSeek = false
    this.playIntent++
    // 普通暂停冻结 AudioContext 与有界队列，继续时沿用解码位置和 DSP 状态。
    // seek/换轨/设备变化才重建，避免每次播放都重新解码 GOP。
    this.playing = undefined
    this.reusePausedAudio = this.presentation.firstFrame && !this.snapshot.seeking
    this.snapshot.currentTime = this.getSnapshot().currentTime
    this.snapshot.paused = true
    cancelAnimationFrame(this.raf)
    clearTimeout(this.audioTimer)
    const context = this.context
    if (context && context.state !== 'closed') this.pauseReady = context.suspend().catch(() => {})
    this.emit('pause')
  }
  seek(time: number) {
    if (!Number.isFinite(time) || !this.client) return
    const playing = this.snapshot.seeking ? this.resumeAfterSeek : !this.snapshot.paused
    this.resumeAfterSeek = playing
    const intent = ++this.playIntent
    this.playing = undefined
    this.snapshot.ended = false
    this.snapshot.currentTime = Math.max(this.startTime, Math.min(time, this.snapshot.duration))
    this.snapshot.seeking = true
    this.snapshot.paused = true
    this.reusePausedAudio = false
    this.stopScheduling()
    const epoch = ++this.epoch
    this.videoBusy = false
    this.audioBusy = false
    this.emit('seeking')
    this.ready = this.position(this.snapshot.currentTime, epoch)
      .then(async () => {
        if (epoch !== this.epoch) return
        this.snapshot.seeking = false
        this.resetOnPlay = false
        this.emit('seeked')
        // 核心也可能在 seeked 同步恢复播放；play 的 paused 检查防止重复排程。
        if (playing && intent === this.playIntent)
          void this.play().catch((error) => {
            if (epoch === this.epoch) this.fail(error)
          })
      })
      .catch((error) => {
        if (epoch === this.epoch) this.fail(error)
        throw error
      })
    void this.ready.catch(() => {})
  }
  private async position(time: number, epoch: number) {
    const client = this.client
    if (!client) return
    this.nextVideo?.frame?.close()
    this.nextVideo = undefined
    this.nextAudio = undefined
    this.audioEnded = false
    this.videoEnded = false
    this.audioEnd = time
    if (this.hasAudio) await this.setupAudio(epoch)
    if (epoch !== this.epoch) return
    const audioTrackId = this.requestedAudioTrackId
    await client.request({ type: 'seek', time, audioTrackId })
    if (epoch !== this.epoch) return
    const [video, audio] = await Promise.all([
      client.request({ type: 'video' }),
      this.hasAudio ? client.request({ type: 'audio' }) : undefined,
    ])
    if (epoch !== this.epoch) {
      if (video.type === 'video') video.frame?.close()
      return
    }
    if (video.type !== 'video' || !video.frame) throw new Error('目标位置没有可显示画面')
    await this.renderer.draw(video.frame, () => epoch === this.epoch, video.rotation)
    if (epoch !== this.epoch) return
    this.presentation.firstFrame = true
    this.recordFrame(video)
    this.selectedAudioTrackId = audioTrackId
    if (audio?.type === 'audio') this.nextAudio = audio
    await this.pullVideo(epoch)
  }
  private async pullVideo(epoch: number) {
    if (!this.client || this.videoBusy || this.nextVideo || this.videoEnded) return
    this.videoBusy = true
    try {
      const reply = await this.client.request({ type: 'video' })
      if (reply.type !== 'video') throw new Error('视频响应无效')
      if (epoch !== this.epoch) {
        reply.frame?.close()
        return
      }
      if (!reply.frame) this.videoEnded = true
      else {
        this.nextVideo = reply
        this.presentation.videoQueuePeak = Math.max(this.presentation.videoQueuePeak ?? 0, 1)
      }
    } finally {
      if (epoch === this.epoch) this.videoBusy = false
    }
  }
  private tick(epoch: number) {
    if (epoch !== this.epoch || this.snapshot.paused) return
    const now = performance.now()
    if (now - this.lastTick > 1500) {
      // 后台 rAF 停顿不等于暂停。用媒体时钟重新定位视频，丢弃旧队列，
      // 避免返回窗口后从数秒前逐帧追赶；seek 保留原来的播放意图。
      this.seek(this.getSnapshot().currentTime)
      return
    }
    this.lastTick = now
    const time = this.getSnapshot().currentTime
    this.lastMediaTime = time
    if (this.nextVideo && this.nextVideo.timestamp <= time) {
      const frame = this.nextVideo.frame!
      const reply = this.nextVideo
      const rotation = reply.rotation
      this.nextVideo = undefined
      if (reply.timestamp + Math.max(reply.duration, 1 / 30) < time - 0.1) {
        frame.close()
        this.presentation.droppedFrames = (this.presentation.droppedFrames ?? 0) + 1
        void this.pullVideo(epoch).catch((error) => {
          if (epoch === this.epoch) this.fail(error)
        })
      } else
        void this.renderer
          .draw(frame, () => epoch === this.epoch, rotation)
          .then(() => {
            if (epoch === this.epoch) this.recordFrame(reply)
            return this.pullVideo(epoch)
          })
          .catch((error) => {
            if (epoch === this.epoch) this.fail(error)
          })
    }
    this.presentation.buffering = this.hasAudio && !this.audioEnded && time >= this.audioEnd
    if (now - this.lastTimeEvent >= 250) {
      this.emit('time-update')
      this.lastTimeEvent = now
    }
    if (time >= this.snapshot.duration && this.videoEnded) {
      this.pause()
      this.snapshot.ended = true
      this.emit('ended')
      return
    }
    this.raf = requestAnimationFrame(() => this.tick(epoch))
  }
  private recordFrame(reply: VideoReply) {
    this.presentation.renderedFrames = (this.presentation.renderedFrames ?? 0) + 1
    if (reply.diagnostics?.mode) {
      this.presentation.decodeThreads =
        reply.diagnostics.mode === 'threads' ? reply.diagnostics.configuredThreads : 1
      if (reply.diagnostics.configuredThreads > 1 && reply.diagnostics.mode !== 'threads')
        this.presentation.fallbackReason = '多线程运行时不可用，已使用单线程'
    }
    const memory = reply.diagnostics?.memory
    if (memory) {
      this.presentation.linearMemoryBytes = memory.linearMemoryBytes
      this.presentation.peakLinearMemoryBytes = Math.max(
        this.presentation.peakLinearMemoryBytes ?? 0,
        memory.linearMemoryBytes,
      )
      this.presentation.decoderWorkerCount = memory.activePthreads + memory.idlePthreads
    }
  }
  private async pumpAudio(epoch: number) {
    if (
      !this.hasAudio ||
      this.audioBusy ||
      this.snapshot.paused ||
      epoch !== this.epoch ||
      !this.context ||
      !this.gain ||
      !this.client
    )
      return
    this.audioBusy = true
    try {
      while (
        !this.snapshot.paused &&
        epoch === this.epoch &&
        !this.audioEnded &&
        this.audioEnd - this.getSnapshot().currentTime < 0.5
      ) {
        const reply = this.nextAudio ?? (await this.client.request({ type: 'audio' }))
        this.nextAudio = undefined
        if (epoch !== this.epoch) return
        if (this.snapshot.paused) {
          if (reply.type === 'audio') this.nextAudio = reply
          return
        }
        if (reply.type !== 'audio') throw new Error('音频响应无效')
        if (!reply.planes.length) {
          this.audioEnded = true
          break
        }
        if (
          (reply.timestamp + reply.duration - this.getSnapshot().currentTime) / this.snapshot.rate >
            0.5 &&
          this.nodes.size
        ) {
          this.nextAudio = reply
          break
        }
        const buffer = this.context.createBuffer(
          reply.planes.length,
          reply.planes[0].length,
          reply.sampleRate,
        )
        reply.planes.forEach((plane, index) => buffer.copyToChannel(plane, index))
        let at = this.anchorClock + (reply.timestamp - this.anchorMedia) / this.snapshot.rate
        const offset = Math.max(0, this.snapshot.currentTime - reply.timestamp)
        if (offset >= reply.duration) continue
        if (at + offset / this.snapshot.rate < this.context.currentTime) {
          const frozen = this.getSnapshot().currentTime
          this.anchorMedia = frozen
          this.anchorClock = this.context.currentTime + 0.03
          at = this.anchorClock + (reply.timestamp - frozen) / this.snapshot.rate
        }
        const node = this.context.createBufferSource()
        node.buffer = buffer
        node.playbackRate.value = this.snapshot.rate
        node.connect(this.stretch ?? this.gain)
        node.onended = () => {
          this.nodes.delete(node)
          node.disconnect()
        }
        this.nodes.add(node)
        node.start(Math.max(this.context.currentTime, at + offset / this.snapshot.rate), offset)
        this.audioEnd = reply.timestamp + reply.duration
        this.presentation.audioAheadPeak = Math.max(
          this.presentation.audioAheadPeak ?? 0,
          (this.audioEnd - this.getSnapshot().currentTime) / this.snapshot.rate,
        )
      }
    } catch (error) {
      if (epoch === this.epoch) this.fail(error)
    } finally {
      if (epoch === this.epoch) {
        this.audioBusy = false
        if (!this.snapshot.paused)
          this.audioTimer = setTimeout(() => void this.pumpAudio(epoch), 20)
      }
    }
  }
  setVolume(volume: number) {
    this.snapshot.volume = Math.min(1, Math.max(0, volume))
    this.updateGain()
    this.emit('volume-change')
  }
  setMuted(muted: boolean) {
    this.snapshot.muted = muted
    this.updateGain()
    this.emit('volume-change')
  }
  setRate(rate: number) {
    if (!Number.isFinite(rate) || rate < 0.25 || rate > 4) throw new Error('倍速必须在 0.25–4 之间')
    if (rate === this.snapshot.rate) return
    const time = this.getSnapshot().currentTime
    this.snapshot.rate = rate
    if (this.client && this.presentation.firstFrame) this.seek(time)
    this.emit('rate-change')
  }
  private updateGain() {
    if (this.gain) this.gain.gain.value = this.snapshot.muted ? 0 : this.snapshot.volume
  }
  private emit(type: Exclude<MediaEvent['type'], 'error'>) {
    this.subject.next({
      type,
      sessionId: this.sessionId,
      snapshot: this.getSnapshot(),
    } as MediaEvent)
  }
  private fail(error: unknown) {
    this.snapshot.seeking = false
    this.presentation.buffering = false
    this.pause()
    this.subject.next({
      type: 'error',
      sessionId: this.sessionId,
      error: {
        code: 'decode',
        message: error instanceof Error ? error.message : '兼容播放失败',
        recoverable: true,
      },
    })
  }
  private stopScheduling() {
    cancelAnimationFrame(this.raf)
    clearTimeout(this.audioTimer)
    for (const node of this.nodes) {
      node.onended = null
      node.stop()
      node.disconnect()
    }
    this.nodes.clear()
  }
  private clear() {
    this.epoch++
    this.playIntent++
    this.playing = undefined
    this.ready = Promise.resolve()
    this.stopScheduling()
    this.client?.close()
    this.client = undefined
    this.nextVideo?.frame?.close()
    this.nextVideo = undefined
    this.nextAudio = undefined
    closeAudioStretch(this.stretch)
    this.stretch = undefined
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {})
    this.context = undefined
    this.gain = undefined
    this.resource?.release()
    this.resource = undefined
    this.videoBusy = false
    this.audioBusy = false
    this.hasAudio = false
    this.startTime = 0
    this.audioTracks = []
    this.selectedAudioTrackId = undefined
    this.requestedAudioTrackId = undefined
    this.resetOnPlay = false
    this.reusePausedAudio = false
    this.resumeAfterSeek = false
    this.stretchDelay = 0
    this.presentation = {
      engine: 'canvas',
      backend: 'unknown',
      firstFrame: false,
      buffering: false,
      width: 0,
      height: 0,
    }
    this.snapshot = {
      ...this.snapshot,
      currentTime: 0,
      duration: 0,
      paused: true,
      seeking: false,
      ended: false,
      buffered: [],
    }
  }
  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    navigator.mediaDevices?.removeEventListener('devicechange', this.onDeviceChange)
    this.clear()
    this.renderer.close()
    this.subject.complete()
  }
}
