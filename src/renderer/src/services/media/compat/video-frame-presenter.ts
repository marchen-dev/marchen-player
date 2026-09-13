type VideoGenerator = MediaStreamTrack & { writable: WritableStream<VideoFrame> }
type GeneratorConstructor = new (options: { kind: 'video' }) => VideoGenerator

export const getVideoGenerator = () =>
  (globalThis as unknown as { MediaStreamTrackGenerator?: GeneratorConstructor })
    .MediaStreamTrackGenerator

/** 仅负责显示已解码帧；音频和媒体时间属于兼容适配器。 */
export class VideoFramePresenter {
  private generation = 0
  private track?: VideoGenerator
  private writer?: WritableStreamDefaultWriter<VideoFrame>
  private callback?: number
  private cancelWrite?: (reason: Error) => void
  private cancelDisplay?: (reason: Error) => void
  private closed = false
  private writing = false
  private observed = false
  submittedFrames = 0
  presentedFrames = 0
  sourceTransfer?: string
  sourcePrimaries?: string

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly timeoutMs = 10_000,
  ) {
    video.muted = true
    video.playsInline = true
  }

  /** 使旧队列和等待立即失效；下一帧才创建轨道，不在暂停时重建。 */
  invalidate() {
    this.generation++
    const reason = new DOMException('视频呈现已取消', 'AbortError')
    this.cancelWrite?.(reason)
    this.cancelDisplay?.(reason)
    this.cancelWrite = undefined
    this.cancelDisplay = undefined
    if (this.callback !== undefined) this.video.cancelVideoFrameCallback(this.callback)
    this.callback = undefined
    this.track?.stop()
    void this.writer?.abort(reason).catch(() => {})
    this.writer = undefined
    this.track = undefined
    this.video.srcObject = null
    this.observed = false
    this.writing = false
  }

  private connect() {
    const Generator = getVideoGenerator()
    if (!Generator || typeof this.video.requestVideoFrameCallback !== 'function')
      throw new Error('当前环境不支持兼容内核的视频呈现')
    this.track = new Generator({ kind: 'video' })
    this.writer = this.track.writable.getWriter()
    this.video.srcObject = new MediaStream([this.track])
  }

  async present(frame: VideoFrame, current: () => boolean, rotation = 0, waitForDisplay = false) {
    let output: VideoFrame | undefined
    const generation = this.generation
    if (this.closed || !current()) {
      frame.close()
      return
    }
    if (this.writing) {
      frame.close()
      throw new Error('视频呈现队列已满')
    }
    this.writing = true
    let timeout: ReturnType<typeof setTimeout> | undefined
    let displayTimeout: ReturnType<typeof setTimeout> | undefined
    let cleanupStart = () => {}
    let rejectDisplay: ((error: Error) => void) | undefined
    try {
      let removeStartListener = () => {}
      const started = !this.writer
        ? new Promise<void>((resolve) => {
            const onStart = () => resolve()
            this.video.addEventListener('loadstart', onStart, { once: true })
            removeStartListener = () => this.video.removeEventListener('loadstart', onStart)
            this.connect()
          })
        : Promise.resolve()
      cleanupStart = removeStartListener
      const confirmation = waitForDisplay || !this.observed
      let displayed: Promise<void> = Promise.resolve()
      if (confirmation) {
        displayed = new Promise<void>((resolve, reject) => {
          rejectDisplay = reject
          this.cancelDisplay = reject
          displayTimeout = setTimeout(() => reject(new Error('视频首帧呈现超时')), this.timeoutMs)
          const observe = () => {
            if (generation !== this.generation || this.closed) return
            this.presentedFrames++
            this.observed = true
            clearTimeout(displayTimeout)
            this.cancelDisplay = undefined
            resolve()
            this.callback = this.video.requestVideoFrameCallback(observe)
          }
          // 首帧/seek 前注册，不能把写入成功当成显示成功。
          this.callback = this.video.requestVideoFrameCallback(observe)
        })
        void displayed.catch(() => {})
      }
      this.sourceTransfer = frame.colorSpace.transfer ?? undefined
      this.sourcePrimaries = frame.colorSpace.primaries ?? undefined
      // 源帧由媒体时钟调度；生成流用单调时间戳，避免 seek/倍速改变显示流时序。
      const init: VideoFrameInit & { rotation: number } = {
        timestamp: Math.round(performance.now() * 1000),
        rotation,
      }
      output = new VideoFrame(frame, init)
      const cancelled = new Promise<never>((_, reject) => {
        this.cancelWrite = reject
        timeout = setTimeout(() => reject(new Error('视频帧写入超时')), this.timeoutMs)
      })
      const playing = this.video.play()
      // 新流挂载到媒体元素是异步的；loadstart 前写首帧会被浏览器丢弃。
      await Promise.race([started, playing.then(() => new Promise<never>(() => {})), cancelled])
      if (generation !== this.generation || !current())
        throw new DOMException('视频呈现已取消', 'AbortError')
      const writing = this.writer!.write(output)
      await Promise.race([Promise.all([playing, writing]), cancelled])
      if (generation !== this.generation || !current())
        throw new DOMException('视频呈现已取消', 'AbortError')
      this.submittedFrames++
      await Promise.race([displayed, cancelled])
    } catch (error) {
      rejectDisplay?.(error instanceof Error ? error : new Error(String(error)))
      throw error
    } finally {
      cleanupStart()
      clearTimeout(timeout)
      clearTimeout(displayTimeout)
      if (generation === this.generation) {
        this.writing = false
        this.cancelWrite = undefined
        this.cancelDisplay = undefined
      }
      output?.close()
      frame.close()
    }
  }

  dispose() {
    if (this.closed) return
    this.closed = true
    this.invalidate()
  }
}
