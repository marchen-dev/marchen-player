import type { CanvasReply, CanvasRequest } from './protocol'

type Command = CanvasRequest extends infer Request
  ? Request extends CanvasRequest
    ? Omit<Request, 'id' | 'generation'>
    : never
  : never

/** 每次 RPC 最多持有一份可转移帧；取消后迟到 VideoFrame 必须显式关闭。 */
export class CanvasDecoderClient {
  private readonly worker = new Worker(new URL('./decoder.worker.ts', import.meta.url), {
    type: 'module',
  })
  private readonly pending = new Map<
    number,
    {
      resolve: (reply: CanvasReply) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  private id = 0
  private generation = 0
  private closed = false
  private decodeStats?: { fps: number | undefined; time: number }
  get decodeFps() {
    return !this.closed && this.decodeStats && performance.now() - this.decodeStats.time < 1500
      ? this.decodeStats.fps
      : undefined
  }
  constructor() {
    this.worker.onmessage = ({ data }: MessageEvent<CanvasReply>) => {
      if (data.type === 'decode-stats') {
        if (!this.closed && data.generation === this.generation)
          this.decodeStats = { fps: data.fps, time: performance.now() }
        return
      }
      const pending = this.pending.get(data.id)
      if (!pending || data.generation !== this.generation) {
        if (data.type === 'video') data.frame?.close()
        return
      }
      this.pending.delete(data.id)
      clearTimeout(pending.timer)
      if (data.type === 'error') pending.reject(new Error(data.message))
      else pending.resolve(data)
    }
    this.worker.onerror = (event) => this.close(new Error(event.message || '媒体 Worker 启动失败'))
  }
  request(command: Command): Promise<CanvasReply> {
    if (this.closed) return Promise.reject(new Error('媒体 Worker 已关闭'))
    if (command.type === 'seek') {
      this.decodeStats = undefined
      this.generation++
      this.rejectPending(new DOMException('已被新的跳转替代', 'AbortError'))
    }
    const id = ++this.id
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // 超时后终止整个 Worker，防止卡住的解码继续占用线程和来源。
        this.close(new Error('媒体解码响应超时'))
      }, 15000)
      this.pending.set(id, { resolve, reject, timer })
      try {
        this.worker.postMessage({ ...command, id, generation: this.generation })
      } catch (error) {
        this.pending.delete(id)
        clearTimeout(timer)
        reject(error)
      }
    })
  }
  close(error: Error = new DOMException('媒体来源已关闭', 'AbortError')) {
    if (this.closed) return
    this.closed = true
    this.rejectPending(error)
    this.worker.terminate()
  }
  private rejectPending(error: Error) {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer)
      request.reject(error)
    }
    this.pending.clear()
  }
}
