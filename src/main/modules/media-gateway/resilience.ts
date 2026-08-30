import type { MediaCompatError } from '@marchen/shared/media'

import { lstat } from 'node:fs/promises'

interface MediaSourceFingerprint {
  size: number
  mtimeMs: number
}

export type MediaSourceIntegrity =
  | { status: 'unchanged' }
  | { status: 'changed'; error: MediaCompatError }
  | { status: 'unavailable'; error: MediaCompatError }

export class MediaSourceIntegrityMonitor {
  #baseline?: MediaSourceFingerprint

  constructor(private readonly sourcePath: string) {}

  async initialize(): Promise<void> {
    this.#baseline = await this.#read()
  }

  async check(): Promise<MediaSourceIntegrity> {
    if (!this.#baseline) await this.initialize()
    let current: MediaSourceFingerprint
    try {
      current = await this.#read()
    } catch (cause) {
      return {
        status: 'unavailable',
        error: {
          code: 'source-unavailable',
          message: '播放期间原始媒体暂时不可读取',
          recoverable: true,
          cause: cause instanceof Error ? cause.message : String(cause),
        },
      }
    }
    if (current.size !== this.#baseline!.size || current.mtimeMs !== this.#baseline!.mtimeMs) {
      return {
        status: 'changed',
        error: {
          code: 'source-changed',
          message: '播放期间原始媒体内容已经变化，需要重新导入确认',
          recoverable: false,
        },
      }
    }
    return { status: 'unchanged' }
  }

  async #read(): Promise<MediaSourceFingerprint> {
    const statistics = await lstat(this.sourcePath)
    if (!statistics.isFile() || statistics.isSymbolicLink()) throw new Error('媒体源不是普通文件')
    return { size: statistics.size, mtimeMs: statistics.mtimeMs }
  }
}

export type MediaRecoveryDecision =
  | { action: 'continue' }
  | { action: 'retry'; logicalTime: number; error?: MediaCompatError }
  | { action: 'failed'; logicalTime: number; error: MediaCompatError }

export interface MediaSessionRecoveryOptions {
  source: MediaSourceIntegrityMonitor
  releaseGeneration: () => Promise<void>
}

/** suspend 不猜测进程是否存活；resume 时以源完整性和 generation 健康事实决定。 */
export class MediaSessionRecoveryCoordinator {
  #suspended = false

  constructor(private readonly options: MediaSessionRecoveryOptions) {}

  suspend(): void {
    this.#suspended = true
  }

  async resume(logicalTime: number, generationHealthy: boolean): Promise<MediaRecoveryDecision> {
    if (!this.#suspended) return { action: 'continue' }
    this.#suspended = false
    const integrity = await this.options.source.check()
    if (integrity.status !== 'unchanged') {
      await this.options.releaseGeneration()
      return {
        action: integrity.status === 'changed' ? 'failed' : 'retry',
        logicalTime: Math.max(0, logicalTime),
        error: integrity.error,
      }
    }
    if (generationHealthy) return { action: 'continue' }
    await this.options.releaseGeneration()
    return { action: 'retry', logicalTime: Math.max(0, logicalTime) }
  }

  async interrupted(logicalTime: number, cause?: unknown): Promise<MediaRecoveryDecision> {
    await this.options.releaseGeneration()
    return {
      action: 'retry',
      logicalTime: Math.max(0, logicalTime),
      error: {
        code: 'generation-failed',
        message: '媒体生产中断，可从当前逻辑时间重试',
        recoverable: true,
        cause: cause instanceof Error ? cause.message : cause == null ? undefined : String(cause),
      },
    }
  }
}
