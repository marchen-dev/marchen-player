import type { CompatSource } from '../../compat/protocol'
import type {
  PgsBitmapFrame,
  PgsSessionErrorCode,
  PgsSessionStats,
  PgsTrackRef,
  PgsWorkerReply,
  PgsWorkerRequest,
} from './protocol'

/** PGS 会话错误：带稳定原因码，fatal 表示会话已不可用 */
export class PgsSessionError extends Error {
  constructor(
    readonly code: PgsSessionErrorCode,
    message: string,
    readonly fatal: boolean,
  ) {
    super(message)
    this.name = 'PgsSessionError'
  }
}

export interface PgsClientEvents {
  frames: (generation: number, frames: PgsBitmapFrame[], keep: number[], ends: [number, number][]) => void
  error: (error: PgsSessionError) => void
}

/** 打开超时：读取 Cues 与轨道信息不应超过这个时间 */
const OPEN_TIMEOUT = 15000
/** 关闭时等待统计回报的上限，超时直接终止 */
const CLOSE_TIMEOUT = 500

/**
 * 主线程侧的 PGS Worker 客户端：负责启动、转发播放位置、接收位图和统计。
 * 迟到的位图（代次过期或已关闭）在这里统一释放，消费者只会收到当前代次的帧。
 */
export class PgsWorkerClient {
  private readonly worker = new Worker(new URL('./pgs.worker.ts', import.meta.url), { type: 'module' })
  private generation = 0
  private closed = false
  private ready?: { resolve: (value: { mode: 'index' | 'scan'; hdr: boolean }) => void; reject: (error: Error) => void }
  private statsWaiter?: (stats: PgsSessionStats | undefined) => void

  constructor(private readonly events: PgsClientEvents) {
    this.worker.onmessage = ({ data }: MessageEvent<PgsWorkerReply>) => this.receive(data)
    this.worker.onerror = (event) => {
      event.preventDefault()
      this.fail(new PgsSessionError('worker_failed', event.message || '字幕 Worker 启动失败', true))
    }
  }

  open(source: CompatSource, track: PgsTrackRef, hdrHint?: boolean, signal?: AbortSignal) {
    return new Promise<{ mode: 'index' | 'scan'; hdr: boolean }>((resolve, reject) => {
      const timer = setTimeout(
        () => this.fail(new PgsSessionError('read_failed', '字幕索引读取超时', true)),
        OPEN_TIMEOUT,
      )
      const abort = () => {
        this.close()
        reject(signal?.reason ?? new DOMException('已取消', 'AbortError'))
      }
      signal?.addEventListener('abort', abort, { once: true })
      this.ready = {
        resolve: (value) => {
          clearTimeout(timer)
          signal?.removeEventListener('abort', abort)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          signal?.removeEventListener('abort', abort)
          reject(error)
        },
      }
      this.send({ type: 'open', source, track, hdrHint })
    })
  }

  /** 跳转、换偏移等需要丢弃旧结果时传 reset = true */
  update(time: number, playing: boolean, reset = false) {
    if (this.closed) return
    if (reset) this.generation++
    this.send({ type: 'update', time, generation: this.generation, playing })
  }

  get currentGeneration() {
    return this.generation
  }

  /** 关闭并尽量取回统计；Worker 卡住时按超时终止 */
  close(): Promise<PgsSessionStats | undefined> {
    if (this.closed) return Promise.resolve(undefined)
    this.closed = true
    this.ready?.reject(new DOMException('字幕会话已关闭', 'AbortError'))
    this.ready = undefined
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const finish = (stats: PgsSessionStats | undefined) => {
        clearTimeout(timer)
        this.statsWaiter = undefined
        this.worker.terminate()
        resolve(stats)
      }
      timer = setTimeout(finish, CLOSE_TIMEOUT, undefined)
      this.statsWaiter = finish
      try {
        this.worker.postMessage({ type: 'close' } satisfies PgsWorkerRequest)
      } catch {
        finish(undefined)
      }
    })
  }

  private send(request: PgsWorkerRequest) {
    try {
      this.worker.postMessage(request)
    } catch (error) {
      this.fail(new PgsSessionError('worker_failed', error instanceof Error ? error.message : String(error), true))
    }
  }

  private receive(reply: PgsWorkerReply) {
    if (reply.type === 'stats') {
      this.statsWaiter?.(reply.stats)
      return
    }
    if (reply.type === 'frames') {
      if (this.closed || reply.generation !== this.generation) {
        for (const frame of reply.frames) for (const rect of frame.rects) rect.bitmap.close()
        return
      }
      this.events.frames(reply.generation, reply.frames, reply.keep, reply.ends)
      return
    }
    if (this.closed) return
    if (reply.type === 'ready') {
      this.ready?.resolve({ mode: reply.mode, hdr: reply.hdr })
      this.ready = undefined
      return
    }
    const error = new PgsSessionError(reply.code, reply.message, reply.fatal)
    if (error.fatal) this.fail(error)
    else this.events.error(error)
  }

  private fail(error: PgsSessionError) {
    if (this.closed) return
    if (this.ready) {
      this.ready.reject(error)
      this.ready = undefined
    } else {
      this.events.error(error)
    }
    void this.close()
  }
}
