/** 用墙钟时间统计解码输出速率；不使用媒体时间，因此倍速不需要额外换算。 */
export class DecodeRate {
  private samples: Array<{ time: number; count: number }> = []

  reset() {
    this.samples = []
  }

  sample(count: number, time = performance.now()): number | undefined {
    if (!Number.isFinite(count) || count < 0) {
      this.reset()
      return undefined
    }
    const last = this.samples.at(-1)
    // 换源、计数回退或后台长时间停止采样时重新建立窗口。
    if (last && (count < last.count || time < last.time || time - last.time > 1500)) this.reset()
    this.samples.push({ time, count })
    while (this.samples.length > 2 && this.samples[1]!.time <= time - 1000) this.samples.shift()
    const first = this.samples[0]!
    const elapsed = time - first.time
    return elapsed >= 1000 ? ((count - first.count) * 1000) / elapsed : undefined
  }
}

/** 仅在独立解码 Worker 内使用；保留原生解码行为，在 output 回调处旁路计数。 */
export function observeVideoDecoder(Base: typeof VideoDecoder, onDecoded: () => void) {
  return class extends Base {
    constructor(init: VideoDecoderInit) {
      super({
        ...init,
        output: (frame) => {
          onDecoded()
          init.output(frame)
        },
      })
    }
  }
}
