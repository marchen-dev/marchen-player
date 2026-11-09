import type { CompatSource } from '../../compat/protocol'
import type { PgsSessionError } from './client'
import type { PgsBitmapFrame, PgsSessionStats, PgsTrackRef } from './protocol'
import { PgsWorkerClient } from './client'

export interface BitmapSessionListener {
  frames: (frames: PgsBitmapFrame[], keep: number[], ends: [number, number][]) => void
  error: (error: PgsSessionError) => void
}

/**
 * 一条 PGS 轨的数据会话：持有 Worker 与读取租约，只负责“给定时间 → 位图帧”。
 * 绘制、时钟和画布尺寸由渲染适配器负责。关闭时先回收 Worker（取回统计），再释放租约。
 */
export class PgsSubtitleSession {
  private listener?: BitmapSessionListener
  private closing?: Promise<PgsSessionStats | undefined>
  /** 监听者挂上之前发生的致命错误，挂上后立即补发 */
  private pendingError?: PgsSessionError

  private constructor(
    private readonly client: PgsWorkerClient,
    readonly mode: 'index' | 'scan',
    readonly hdr: boolean,
    private readonly release: () => void,
  ) {}

  /** 打开 Worker 并读取索引；失败或取消时释放租约并抛出 */
  static async open(
    source: CompatSource,
    track: PgsTrackRef,
    options: { hdrHint?: boolean; release: () => void; signal?: AbortSignal },
  ) {
    let session: PgsSubtitleSession | undefined
    const client = new PgsWorkerClient({
      frames: (_generation, frames, keep, ends) => {
        if (session?.listener) session.listener.frames(frames, keep, ends)
        // 没有监听者（尚未挂到画布）：位图无人使用，立即释放
        else for (const frame of frames) for (const rect of frame.rects) rect.bitmap.close()
      },
      error: (error) => {
        if (session?.listener) session.listener.error(error)
        else if (session) session.pendingError = error
      },
    })
    try {
      const ready = await client.open(source, track, options.hdrHint, options.signal)
      session = new PgsSubtitleSession(client, ready.mode, ready.hdr, options.release)
      return session
    } catch (error) {
      void client.close()
      options.release()
      throw error
    }
  }

  setListener(listener: BitmapSessionListener | undefined) {
    this.listener = listener
    const error = this.pendingError
    this.pendingError = undefined
    if (listener && error) listener.error(error)
  }

  /** reset = true 表示跳转等需要丢弃旧位图的操作 */
  update(time: number, playing: boolean, reset = false) {
    if (this.closing) return
    this.client.update(time, playing, reset)
  }

  /** 幂等；返回 Worker 回报的会话统计（超时或已失败时为 undefined） */
  close(): Promise<PgsSessionStats | undefined> {
    this.closing ??= this.client.close().finally(() => this.release())
    this.listener = undefined
    return this.closing
  }
}
