import { createRequire } from 'node:module'

const _require = createRequire(import.meta.url)

const loadNativeAddon = () => {
  try {
    return _require('../../native/build/Release/marchen_decoder.node')
  } catch (error) {
    console.error('Failed to load native addon:', error)
  }
}

const native = loadNativeAddon()

export interface OpenOptions {
  forceSoftwareDecode?: boolean
}

export interface FrameInfo {
  /** 显示时间戳 (秒) */
  pts: number
  /** 帧宽度 */
  width: number
  /** 帧高度 */
  height: number
}

export interface VideoMetadata {
  /** 视频宽度 (像素) */
  width: number
  /** 视频高度 (像素) */
  height: number
  /** 视频时长 (秒) */
  duration: number
  /** 帧率 */
  frameRate: number
  /** 编解码器名称 */
  codecName: string
  /** 是否启用硬件加速 */
  hwAccel: boolean
  /** 硬件加速设备名称 */
  hwDevice: string
  /** 需要的 buffer 大小 (bytes) */
  bufferSize: number
}

export class MarchenDecoder {
  public native: any
  private isOpen = false
  private metadata: VideoMetadata | null = null

  constructor() {
    this.native = new native.MarchenDecoder()
  }

  open(filePath: string, options?: OpenOptions) {
    if (this.isOpen) {
      this.close()
    }
    this.metadata = this.native.open(filePath, options || {})
    this.isOpen = true
    return this.metadata!
  }

  setVideoBuffer(buffer: Uint8Array | Uint8ClampedArray): boolean {
    if (!this.isOpen) {
      throw new Error('Decoder is not open')
    }
    return this.native.setVideoBuffer(buffer)
  }

  close() {
    if (this.isOpen) {
      this.native.close()
      this.isOpen = false
      this.metadata = null
    }
  }

  decodeFrame(): FrameInfo | null {
    if (!this.isOpen) {
      throw new Error('Decoder not open')
    }
    return this.native.decodeFrame()
  }
}
