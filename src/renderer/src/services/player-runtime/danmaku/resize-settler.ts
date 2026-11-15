export interface DanmakuStageSize {
  width: number
  height: number
}

/** 拖动窗口时 ResizeObserver 每帧都会触发；停稳这么久之后才按新尺寸重建弹幕。 */
export const DANMAKU_RESIZE_SETTLE_MS = 150

/**
 * 容器尺寸变化的去抖器：连续变化期间只记住最新尺寸，停稳后一次性交给 onSettle。
 * 渲染器据此在拖动期间保留旧弹幕继续运动，只在最终尺寸上做一次快照恢复，
 * 避免每帧都打断异步恢复导致拖动全程空屏。
 */
export class DanmakuResizeSettler {
  private pending: DanmakuStageSize | null = null
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly onSettle: (size: DanmakuStageSize) => void,
    private readonly delay = DANMAKU_RESIZE_SETTLE_MS,
  ) {}

  get isPending() {
    return this.pending !== null
  }

  /** 记录最新尺寸并重新开始计时。 */
  schedule(size: DanmakuStageSize): void {
    this.pending = size
    this.clearTimer()
    this.timer = setTimeout(() => {
      this.timer = null
      const settled = this.take()
      if (settled) this.onSettle(settled)
    }, this.delay)
  }

  /** 取走待定尺寸且不再触发 onSettle；其他路径（如 seek 落点）抢先重建时使用。 */
  take(): DanmakuStageSize | null {
    const size = this.pending
    this.pending = null
    this.clearTimer()
    return size
  }

  /** 放弃待定尺寸，返回此前是否处于待定状态。 */
  cancel(): boolean {
    return this.take() !== null
  }

  private clearTimer(): void {
    if (this.timer === null) return
    clearTimeout(this.timer)
    this.timer = null
  }
}
