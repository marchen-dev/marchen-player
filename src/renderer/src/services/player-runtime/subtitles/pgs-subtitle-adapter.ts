import type { PlaybackClock } from '@marchen/playback-core'
import type { PgsSessionError } from '@renderer/services/media/subtitles/pgs/client'
import type { PgsBitmapFrame, PgsSessionStats } from '@renderer/services/media/subtitles/pgs/protocol'
import type { BitmapSubtitleSession } from '../platform/ports'

/** 时间跳变超过这个值视为跳转：丢弃旧位图并让 Worker 换代次 */
const SEEK_THRESHOLD = 1
/** 播放中向 Worker 报告位置的最小间隔（毫秒） */
const UPDATE_INTERVAL = 250

export interface BitmapSessionReport {
  stats?: PgsSessionStats
  mode: 'index' | 'scan'
  hdr: boolean
}

/**
 * 位图字幕（PGS）的渲染适配器：按共用时钟选出当前显示集并绘制到画布。
 *
 * 数据由会话（Worker）按窗口产出；这里只保存 Worker 要求保留的帧，其余位图立即 close。
 * 跳转时清空本地帧并让会话换代次，迟到的旧位图由客户端丢弃，因此画面不会出现旧位置的字幕。
 */
export class PgsSubtitleAdapter {
  private session: BitmapSubtitleSession | null = null
  private release: (() => void) | null = null
  private readonly frames = new Map<number, PgsBitmapFrame>()
  private timeOffset = 0
  private lastTime = Number.NaN
  private lastPlaying?: boolean
  private lastSentTime = Number.NaN
  private lastUpdateAt = Number.NEGATIVE_INFINITY
  /** 当前画布上的帧；undefined 表示需要重画 */
  private drawnKey: number | null | undefined
  private disposed = false

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly clock: PlaybackClock,
    private readonly onError: (error: PgsSessionError) => void,
    private readonly onClosed: (report: BitmapSessionReport) => void = () => {},
    private readonly now: () => number = () => performance.now(),
  ) {}

  get active() {
    return this.session !== null
  }

  /** 换上新的会话；release 负责关闭会话及其租约 */
  setSession(session: BitmapSubtitleSession, release?: () => void): boolean {
    if (this.disposed) {
      release?.()
      return false
    }
    this.close()
    this.session = session
    this.release = release ?? (() => void session.close())
    session.setListener({
      frames: (frames, keep, ends) => this.receive(session, frames, keep, ends),
      error: (error) => {
        if (this.session !== session) return
        if (!error.fatal) return
        this.close()
        this.onError(error)
      },
    })
    this.lastTime = Number.NaN
    this.sync(true)
    return true
  }

  close(): void {
    const session = this.session
    if (!session) return
    this.session = null
    session.setListener(undefined)
    const release = this.release
    this.release = null
    // 先取回统计（close 幂等，release 内部也会调用），再释放
    const closing = session.close()
    release?.()
    void closing.then((stats) => this.onClosed({ stats, mode: session.mode, hdr: session.hdr }))
    this.clearFrames()
    this.clearCanvas()
  }

  setTimeOffset(offset: number): void {
    this.timeOffset = Number.isFinite(offset) ? offset : 0
    this.sync(true)
  }

  /** 画布尺寸变化后重画 */
  resize(): void {
    this.drawnKey = undefined
    this.sync()
  }

  /** 由宿主每帧调用 */
  sync(force = false): void {
    const session = this.session
    if (this.disposed || !session) return
    const snapshot = this.clock.snapshot()
    const time = this.clock.now() + this.timeOffset
    const playing = !(snapshot.paused || snapshot.seeking)
    const jumped = !Number.isFinite(this.lastTime) || Math.abs(time - this.lastTime) > SEEK_THRESHOLD
    const now = this.now()
    if (jumped) {
      this.clearFrames()
      session.update(time, playing, true)
      this.markSent(time, playing, now)
    } else if (
      force ||
      playing !== this.lastPlaying ||
      (time !== this.lastSentTime && now - this.lastUpdateAt >= UPDATE_INTERVAL)
    ) {
      session.update(time, playing)
      this.markSent(time, playing, now)
    }
    this.lastTime = time
    this.draw(time)
  }

  dispose(): void {
    if (this.disposed) return
    this.close()
    this.disposed = true
  }

  private markSent(time: number, playing: boolean, now: number) {
    this.lastSentTime = time
    this.lastPlaying = playing
    this.lastUpdateAt = now
  }

  private receive(
    session: BitmapSubtitleSession,
    frames: PgsBitmapFrame[],
    keep: number[],
    ends: [number, number][],
  ) {
    if (this.session !== session) {
      for (const frame of frames) closeFrame(frame)
      return
    }
    for (const frame of frames) {
      const previous = this.frames.get(frame.key)
      if (previous) closeFrame(previous)
      this.frames.set(frame.key, frame)
    }
    for (const [key, end] of ends) {
      const frame = this.frames.get(key)
      if (frame) frame.end = end
    }
    const kept = new Set(keep)
    for (const [key, frame] of this.frames) {
      if (kept.has(key)) continue
      closeFrame(frame)
      this.frames.delete(key)
    }
    this.drawnKey = undefined
    if (Number.isFinite(this.lastTime)) this.draw(this.lastTime)
  }

  private activeFrame(time: number) {
    let active: PgsBitmapFrame | undefined
    for (const frame of this.frames.values()) {
      if (frame.start <= time && time < frame.end && (!active || frame.start > active.start))
        active = frame
    }
    return active
  }

  private draw(time: number) {
    const frame = this.activeFrame(time)
    const key = frame?.key ?? null
    if (key === this.drawnKey) return
    this.drawnKey = key
    const context = this.canvas.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, this.canvas.width, this.canvas.height)
    if (!frame || !frame.rects.length) return
    // PGS 画布（如 1920×1080）按宽度等比缩放到视频显示区域，并在垂直方向居中。
    // 视频被裁过黑边时，PGS 画布比视频高；字幕超出画面时向内收，保证完整可见。
    const scale = this.canvas.width / frame.width
    const offsetY = (this.canvas.height - frame.height * scale) / 2
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    for (const rect of frame.rects) {
      const width = rect.width * scale
      const height = rect.height * scale
      const x = rect.x * scale
      let y = offsetY + rect.y * scale
      if (y + height > this.canvas.height) y = this.canvas.height - height
      if (y < 0) y = 0
      context.drawImage(rect.bitmap, x, y, width, height)
    }
  }

  private clearFrames() {
    for (const frame of this.frames.values()) closeFrame(frame)
    this.frames.clear()
    this.drawnKey = undefined
  }

  private clearCanvas() {
    this.canvas.getContext('2d')?.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.drawnKey = null
  }
}

function closeFrame(frame: PgsBitmapFrame) {
  for (const rect of frame.rects) rect.bitmap.close()
}
