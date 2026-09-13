type Generator = MediaStreamTrack & { writable: WritableStream<VideoFrame> }
declare global {
  interface Window {
    realVideoRenderer?: CanvasFrameRenderer
  }
}
export class HdrFrameLayoutError extends Error {}

/** 仅由实验 Vite 配置替换正式 renderer，解码与音频适配器保持原样。 */
export class CanvasFrameRenderer {
  colorOutput = undefined
  readonly video = document.querySelector<HTMLVideoElement>('#video')!
  private track?: Generator
  private writer?: WritableStreamDefaultWriter<VideoFrame>
  private generation = 0
  private callback = 0
  stats = {
    submitted: 0,
    presented: 0,
    lastSubmittedPts: 0,
    presentationTime: 0,
    format: null as string | null,
    transfer: null as string | null,
    primaries: null as string | null,
    resets: 0,
  }
  constructor(_canvas: HTMLCanvasElement) {
    window.realVideoRenderer = this
    this.reset()
    const observe = (_now: number, meta: VideoFrameCallbackMetadata) => {
      this.stats.presented++
      // MediaStream 的显示时间线不等于源文件 PTS，分别记录，不能直接相减当音画延迟。
      this.stats.presentationTime = meta.mediaTime
      this.callback = this.video.requestVideoFrameCallback(observe)
    }
    this.callback = this.video.requestVideoFrameCallback(observe)
  }
  reset() {
    this.generation++
    this.track?.stop()
    void this.writer?.abort().catch(() => {})
    const Constructor = (
      globalThis as unknown as {
        MediaStreamTrackGenerator: new (options: { kind: 'video' }) => Generator
      }
    ).MediaStreamTrackGenerator
    if (!Constructor) throw new Error('当前浏览器没有视频轨道生成接口')
    this.track = new Constructor({ kind: 'video' })
    this.writer = this.track.writable.getWriter()
    this.video.srcObject = new MediaStream([this.track])
    this.stats.resets++
  }
  async draw(frame: VideoFrame, current: () => boolean = () => true, rotation = 0) {
    let output: VideoFrame | undefined
    const generation = this.generation
    try {
      if (!current()) return
      this.stats.format = frame.format
      this.stats.transfer = frame.colorSpace.transfer
      this.stats.primaries = frame.colorSpace.primaries
      this.video.style.transform = `rotate(${rotation}deg)`
      const timestamp = Math.round(performance.now() * 1000)
      this.stats.lastSubmittedPts = frame.timestamp / 1e6
      output = new VideoFrame(frame, { timestamp })
      const playing = this.video.play()
      // 及时安装拒绝处理器；首帧要先写入，play 才能完成。
      void playing.catch(() => {})
      await this.writer!.write(output)
      await playing
      if (generation === this.generation && current()) this.stats.submitted++
    } finally {
      output?.close()
      frame.close()
    }
  }
  close() {
    this.generation++
    this.video.cancelVideoFrameCallback(this.callback)
    this.track?.stop()
    void this.writer?.abort().catch(() => {})
    this.video.srcObject = null
  }
}
