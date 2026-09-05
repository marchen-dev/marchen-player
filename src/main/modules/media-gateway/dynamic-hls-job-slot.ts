import type { MediaCompatError, PlaybackJobCoverage } from '@marchen/shared/media'
import { SegmentStore } from './segment-store'
import type { SegmentProducerOwner } from './segment-store'

export interface DynamicHlsJobHandle {
  id: string
  coverage: PlaybackJobCoverage
  stop: () => Promise<void>
  /** 已退出的进程不能因 coverage 命中而被当成仍会产出的 Job。 */
  isRunning?: () => boolean
}

export interface DynamicHlsJobFactory {
  start: (input: {
    segmentIndex: number
    epoch: number
    workingKey: string
    owner: SegmentProducerOwner
  }) => Promise<DynamicHlsJobHandle>
}

export interface DynamicHlsJobSlotOptions {
  store: SegmentStore
  factory: DynamicHlsJobFactory
  maxForwardGapSegments?: number
  activeRequestWaitMs?: number
  pollMs?: number
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class DynamicHlsJobSlot {
  #current?: DynamicHlsJobHandle
  #operation: Promise<unknown> = Promise.resolve()
  #epoch = 0
  #owner?: SegmentProducerOwner
  #closed = false

  constructor(private readonly options: DynamicHlsJobSlotOptions) {}

  get owner(): SegmentProducerOwner | undefined {
    return this.#owner ? { ...this.#owner } : undefined
  }

  get current(): DynamicHlsJobHandle | undefined {
    return this.#current ? { ...this.#current, coverage: { ...this.#current.coverage } } : undefined
  }

  ensure(segmentIndex: number, signal?: AbortSignal): Promise<DynamicHlsJobHandle> {
    if (!Number.isSafeInteger(segmentIndex) || segmentIndex < 0) {
      return Promise.reject(new RangeError('Dynamic HLS Job segment index 无效'))
    }
    return this.#enqueue(async () => {
      if (this.#closed) throw new Error('Dynamic HLS 会话已关闭')
      if (signal?.aborted) throw signal.reason ?? new Error('cancelled')
      const current = this.#current
      if (current && !this.#owner) throw new Error('旧 Job 停止尚未确认，不能启动新生产')
      if (
        current &&
        current.isRunning?.() !== false &&
        !this.#requiresReplacement(current.coverage, segmentIndex)
      ) {
        this.options.store.markProducing(segmentIndex, this.#owner)
        return current
      }
      if (current) {
        await this.#waitForActiveRequests(signal)
        await this.#stopCurrent(current)
      }
      if (this.#closed) throw new Error('Dynamic HLS 会话已关闭')
      const epoch = this.#epoch++
      const owner = { jobId: `job-${epoch}`, epoch }
      this.#owner = owner
      this.options.store.beginJob(owner, segmentIndex)
      let next: DynamicHlsJobHandle
      try {
        next = await this.options.factory.start({
          segmentIndex,
          epoch,
          workingKey: `job-${epoch}`,
          owner,
        })
      } catch (cause) {
        this.options.store.endJob(owner, {
          code: 'generation-failed',
          stage: 'transcode',
          message: 'Playback Job 启动失败',
          recoverable: true,
        })
        this.#owner = undefined
        throw cause
      }
      if (this.#current) {
        await next.stop()
        throw new Error('Dynamic HLS Job slot 出现并发写入者')
      }
      this.#current = next
      if (this.#closed) {
        await this.#stopCurrent(next)
        throw new Error('Dynamic HLS 会话已关闭')
      }
      return next
    })
  }

  updateCoverage(jobId: string, coverage: PlaybackJobCoverage): void {
    if (this.#current?.id !== jobId) return
    this.#current = { ...this.#current, coverage: { ...coverage } }
  }

  release(signal?: AbortSignal): Promise<void> {
    return this.#enqueue(async () => {
      const current = this.#current
      if (!current) return
      await this.#waitForActiveRequests(signal)
      await this.#stopCurrent(current)
    })
  }

  /** 崩溃、切集或 app quit 不等待已发布文件响应结束，但也不删除这些资源。 */
  releaseImmediately(): Promise<void> {
    return this.#enqueue(async () => {
      const current = this.#current
      if (!current) return
      await this.#stopCurrent(current)
    })
  }

  /** 永久关闭与 ahead/idle 的临时停止不同，排队中的请求也不得重启生产。 */
  close(): Promise<void> {
    this.#closed = true
    return this.releaseImmediately()
  }

  async #stopCurrent(current: DynamicHlsJobHandle): Promise<void> {
    const error: MediaCompatError = {
      code: 'cancelled',
      stage: 'transcode',
      message: 'Playback Job 已停止或替换，请重试分片',
      recoverable: true,
    }
    if (this.#owner) {
      this.options.store.endJob(this.#owner, error)
      this.#owner = undefined
    }
    await current.stop()
    if (this.#current?.id === current.id) this.#current = undefined
  }

  #requiresReplacement(coverage: PlaybackJobCoverage, requested: number): boolean {
    if (requested < coverage.startSegment) return true
    if (coverage.endSegment === undefined) {
      return requested - coverage.startSegment > (this.options.maxForwardGapSegments ?? 12)
    }
    if (requested <= coverage.endSegment) return false
    return requested - coverage.endSegment > (this.options.maxForwardGapSegments ?? 12)
  }

  async #waitForActiveRequests(signal?: AbortSignal): Promise<void> {
    const deadline = Date.now() + (this.options.activeRequestWaitMs ?? 10_000)
    while (this.#hasActiveRequests()) {
      if (this.#closed) return
      if (signal?.aborted) throw signal.reason ?? new Error('cancelled')
      if (Date.now() >= deadline) throw new Error('等待活动 HLS 响应结束超时')
      await wait(this.options.pollMs ?? 20)
    }
  }

  #hasActiveRequests(): boolean {
    const snapshot = this.options.store.snapshot
    return (
      snapshot.initActiveRequestCount > 0 ||
      snapshot.entries.some((entry) => entry.activeRequestCount > 0)
    )
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#operation.then(operation, operation)
    this.#operation = result.catch(() => undefined)
    return result
  }
}
