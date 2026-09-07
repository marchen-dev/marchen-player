import type { DurableMediaSource } from '@marchen/shared/media'
import { openPlaybackResource } from '../player-runtime/platform/media-resource'
import { CanvasDecoderClient } from './canvas/client'
import { CanvasFrameRenderer, HdrFrameLayoutError } from './canvas/frame-renderer'

export interface FrameRequest {
  source: DurableMediaSource
  time: number
  rotation?: 0 | 90 | 180 | 270
  maxWidth?: number
  signal?: AbortSignal
}

/** 后台取帧使用独立解码请求，不改变正在播放的媒体位置。 */
class RetryHevcFrame extends Error {}
export async function captureMediaFrame(request: FrameRequest): Promise<string> {
  try {
    return await captureFrameOnce(request, false)
  } catch (error) {
    if (error instanceof RetryHevcFrame) return captureFrameOnce(request, true)
    throw error
  }
}
async function captureFrameOnce(request: FrameRequest, softwareFallback: boolean): Promise<string> {
  const signal = request.signal ?? new AbortController().signal
  signal.throwIfAborted()
  const resource = await openPlaybackResource(request.source, signal)
  const client = new CanvasDecoderClient()
  const canvas = document.createElement('canvas')
  const renderer = new CanvasFrameRenderer(canvas)
  const abort = () => client.close()
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
  let frame: VideoFrame | null = null
  try {
    const descriptor = resource.canvas()
    try {
      const ready = await client.request({
        type: 'open',
        source: descriptor.source,
        assetBase: descriptor.assetBase,
        videoOnly: true,
        forceSoftware: softwareFallback,
      })
      if (ready.type !== 'ready') throw new Error('无法准备视频缩略图')
      await client.request({
        type: 'seek',
        time: Math.max(0, Math.min(request.time, ready.duration)),
      })
      const reply = await client.request({ type: 'video' })
      if (reply.type !== 'video' || !reply.frame) throw new Error('当前位置没有视频画面')
      frame = reply.frame
      signal.throwIfAborted()
      try {
        await renderer.draw(frame, () => !signal.aborted, reply.rotation)
      } catch (error) {
        if (
          !softwareFallback &&
          ready.videoCodec === 'hevc' &&
          error instanceof HdrFrameLayoutError
        )
          throw new RetryHevcFrame(error.message)
        throw error
      }
      frame = null
      signal.throwIfAborted()
      const rotation = request.rotation ?? 0
      const swapped = rotation === 90 || rotation === 270
      const width = swapped ? canvas.height : canvas.width
      const height = swapped ? canvas.width : canvas.height
      const scale = Math.min(1, (request.maxWidth ?? width) / width)
      const output = document.createElement('canvas')
      output.width = Math.max(1, Math.round(width * scale))
      output.height = Math.max(1, Math.round(height * scale))
      try {
        const context = output.getContext('2d')
        if (!context) throw new Error('无法创建取帧画布')
        context.translate(output.width / 2, output.height / 2)
        context.rotate((rotation * Math.PI) / 180)
        context.drawImage(
          canvas,
          (-canvas.width * scale) / 2,
          (-canvas.height * scale) / 2,
          canvas.width * scale,
          canvas.height * scale,
        )
        const blob = await new Promise<Blob>((resolve, reject) =>
          output.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('缩略图编码失败'))),
            'image/jpeg',
            0.9,
          ),
        )
        signal.throwIfAborted()
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(blob)
        })
      } finally {
        output.width = output.height = 1
      }
    } finally {
      descriptor.release()
    }
  } finally {
    frame?.close()
    signal.removeEventListener('abort', abort)
    client.close()
    renderer.close()
    canvas.width = canvas.height = 1
    resource.close()
  }
}
