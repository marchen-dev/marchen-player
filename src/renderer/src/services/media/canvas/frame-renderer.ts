import { VideoSample } from 'mediabunny'
import { HdrSdrRenderer } from '../render/hdr-sdr'

export class HdrFrameLayoutError extends Error {}

/** 画布合成走 GPU，HDR 转换只拷贝 YUV 平面，不在 CPU 生成 RGBA。 */
export class CanvasFrameRenderer {
  colorOutput?: 'sdr' | 'hdr-to-sdr'
  private readonly context: CanvasRenderingContext2D
  private hdr?: HdrSdrRenderer
  private hdrCanvas?: OffscreenCanvas
  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('无法创建视频画布')
    this.context = context
  }
  async draw(frame: VideoFrame, current: () => boolean = () => true, rotation = 0) {
    try {
      if (!current()) return
      if (this.context.isContextLost()) throw new Error('视频绘制上下文丢失，请重试播放')
      const width = rotation % 180 ? frame.displayHeight : frame.displayWidth
      const height = rotation % 180 ? frame.displayWidth : frame.displayHeight
      if (this.canvas.width !== width) this.canvas.width = width
      if (this.canvas.height !== height) this.canvas.height = height
      this.context.setTransform(1, 0, 0, 1, width / 2, height / 2)
      this.context.rotate((rotation * Math.PI) / 180)
      const transfer = String(frame.colorSpace.transfer)
      if (transfer === 'pq' || transfer === 'hlg') {
        const sample = new VideoSample(frame)
        try {
          if (!['I420', 'I420P10'].includes(sample.format ?? '')) {
            // GPU-backed 帧不一定暴露 CPU 平面，但仍是合法 CanvasImageSource。
            // 交给浏览器从帧色彩空间转换到 SDR 画布，不能因无法读 YUV 就放弃硬解。
            try {
              this.context.drawImage(frame, -frame.displayWidth / 2, -frame.displayHeight / 2)
              this.colorOutput = 'hdr-to-sdr'
              return
            } catch {
              throw new HdrFrameLayoutError('浏览器无法绘制当前 HDR 硬解帧')
            }
          }
          const data = new Uint8Array(sample.allocationSize())
          const layout = await sample.copyTo(data)
          if (!current()) return
          this.hdrCanvas ??= new OffscreenCanvas(frame.displayWidth, frame.displayHeight)
          if (this.hdrCanvas.width !== frame.displayWidth) this.hdrCanvas.width = frame.displayWidth
          if (this.hdrCanvas.height !== frame.displayHeight)
            this.hdrCanvas.height = frame.displayHeight
          this.hdr ??= new HdrSdrRenderer(this.hdrCanvas)
          this.hdr.draw({
            data,
            layout,
            width: frame.codedWidth,
            height: frame.codedHeight,
            bitDepth: sample.format === 'I420P10' ? 10 : 8,
            colorSpace: sample.colorSpace,
            visibleRect: frame.visibleRect ?? undefined,
          })
          this.context.drawImage(this.hdrCanvas, -frame.displayWidth / 2, -frame.displayHeight / 2)
          this.colorOutput = 'hdr-to-sdr'
        } finally {
          sample.close()
        }
      } else {
        this.context.drawImage(frame, -frame.displayWidth / 2, -frame.displayHeight / 2)
        this.colorOutput = 'sdr'
      }
    } finally {
      frame.close()
    }
  }
  close() {
    this.hdr?.close()
    this.hdr = undefined
    this.hdrCanvas = undefined
    this.colorOutput = undefined
  }
}
