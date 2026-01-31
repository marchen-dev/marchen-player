/* eslint-disable @typescript-eslint/method-signature-style */
// renderer/lib/decoder.ts

export interface VideoMetadata {
  width: number
  height: number
  duration: number
  frameRate: number
  codecName: string
  hwAccel: boolean
  hwDevice: string
  bufferSize: number
}

export interface FrameInfo {
  pts: number
  width: number
  height: number
}

declare global {
  interface Window {
    decoder: {
      create(): number
      open(id: number, filePath: string, options?: { forceSoftwareDecode?: boolean }): VideoMetadata
      decodeFrame(id: number): FrameInfo | null
      seek(id: number, timestamp: number): boolean
      close(id: number): void
      getHwAccelInfo(id: number): { enabled: boolean; device: string; available: string[] }
    }
    api: {
      showFilePath(file: File): string
    }
    platform: NodeJS.Platform
  }
}

export class VideoDecoder {
  private id: number
  private metadata: VideoMetadata | null = null
  private sharedBuffer: SharedArrayBuffer | null = null
  private frameBuffer: Uint8ClampedArray | null = null
  private isOpen = false

  constructor() {
    this.id = window.decoder.create()
  }

  async open(
    filePath: string,
    options?: { forceSoftwareDecode?: boolean },
  ): Promise<VideoMetadata> {
    if (this.isOpen) {
      this.close()
    }

    // 先设置监听器，等待 SharedArrayBuffer
    const bufferPromise = new Promise<SharedArrayBuffer>((resolve) => {
      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'decoder-shared-buffer' && event.data?.decoderId === this.id) {
          window.removeEventListener('message', handler)
          resolve(event.data.buffer)
        }
      }
      window.addEventListener('message', handler)
    })

    // 调用 open，会触发 postMessage
    this.metadata = window.decoder.open(this.id, filePath, options)
    this.isOpen = true

    // 等待接收 SharedArrayBuffer
    this.sharedBuffer = await bufferPromise
    this.frameBuffer = new Uint8ClampedArray(this.sharedBuffer)

    return this.metadata
  }

  decodeFrame(): { imageData: ImageData; pts: number } | null {
    if (!this.isOpen || !this.metadata || !this.frameBuffer) {
      throw new Error('Decoder not open')
    }

    const frameInfo = window.decoder.decodeFrame(this.id)
    if (!frameInfo) {
      return null
    }

    const imageData = new ImageData(
      new Uint8ClampedArray(this.frameBuffer),
      frameInfo.width,
      frameInfo.height,
    )

    return {
      imageData,
      pts: frameInfo.pts,
    }
  }

  decodeFrameRaw(): {
    buffer: Uint8ClampedArray
    pts: number
    width: number
    height: number
  } | null {
    if (!this.isOpen || !this.metadata || !this.frameBuffer) {
      throw new Error('Decoder not open')
    }

    const frameInfo = window.decoder.decodeFrame(this.id)
    if (!frameInfo) {
      return null
    }

    return {
      buffer: this.frameBuffer,
      pts: frameInfo.pts,
      width: frameInfo.width,
      height: frameInfo.height,
    }
  }

  seek(timestamp: number): boolean {
    if (!this.isOpen) {
      throw new Error('Decoder not open')
    }
    return window.decoder.seek(this.id, timestamp)
  }

  getMetadata(): VideoMetadata | null {
    return this.metadata
  }

  getHwAccelInfo() {
    return window.decoder.getHwAccelInfo(this.id)
  }

  close(): void {
    if (this.isOpen) {
      window.decoder.close(this.id)
      this.isOpen = false
      this.metadata = null
      this.sharedBuffer = null
      this.frameBuffer = null
    }
  }
}
