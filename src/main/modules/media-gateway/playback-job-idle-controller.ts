import { FfmpegExecutionError, type FfmpegExecution } from '../ffmpeg/executor'
import { toMediaCompatError } from './errors'
import { PlaybackJobManager } from './playback-job-manager'

export interface PlaybackJobIdleControllerOptions {
  manager: PlaybackJobManager
  execution: Pick<FfmpegExecution, 'result' | 'stop'>
  idleTimeoutMs?: number
  pollMs?: number
}

/**
 * 只在 Job 没有活跃请求/waiter，且客户端心跳超过期限时停止；FFmpeg progress 不能延长空闲寿命。
 * 实际的“stdin 优雅退出 → 超时强杀”由 FfmpegProcessExecutor.stop 保证。
 */
export class PlaybackJobIdleController {
  #timer?: NodeJS.Timeout
  #stopPromise?: Promise<boolean>

  constructor(private readonly options: PlaybackJobIdleControllerOptions) {}

  start(): void {
    if (this.#timer) return
    this.#timer = setInterval(() => void this.check(), this.options.pollMs ?? 1_000)
    this.#timer.unref()
  }

  dispose(): void {
    if (this.#timer) clearInterval(this.#timer)
    this.#timer = undefined
  }

  check(now = Date.now()): Promise<boolean> {
    if (this.#stopPromise) return this.#stopPromise
    const snapshot = this.options.manager.snapshot
    if (snapshot.phase !== 'producing' && snapshot.phase !== 'throttled') {
      return Promise.resolve(false)
    }
    if (snapshot.activeRequestCount > 0 || snapshot.waiterCount > 0) return Promise.resolve(false)
    const lastActivityAt = snapshot.lastHeartbeatAt ?? snapshot.startedAt
    if (
      lastActivityAt === undefined ||
      now - lastActivityAt < (this.options.idleTimeoutMs ?? 60_000)
    ) {
      return Promise.resolve(false)
    }

    this.#stopPromise = this.#stop()
    return this.#stopPromise
  }

  async #stop(): Promise<boolean> {
    this.options.manager.requestStop()
    this.options.execution.stop()
    try {
      const result = await this.options.execution.result
      this.options.manager.reportStoppedEvidence({ exitCode: result.code })
    } catch (cause) {
      if (cause instanceof FfmpegExecutionError && cause.failure === 'cancelled') {
        // 主动停止允许通过 AbortController 收尾，close 已发生，不应报生产失败。
        this.options.manager.reportStoppedEvidence({ exitCode: cause.code ?? undefined })
      } else
        this.options.manager.reportFailure(
          toMediaCompatError(cause, {
            code: 'generation-failed',
            stage: 'transcode',
            message: 'Playback Job 空闲停止失败',
            recoverable: true,
          }),
        )
    } finally {
      this.dispose()
    }
    return true
  }
}
