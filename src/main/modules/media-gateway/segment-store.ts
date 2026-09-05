import type {
  HlsTimeline,
  MediaCompatError,
  SegmentResourceStatus,
  SegmentStoreSnapshot,
} from '@marchen/shared/media'
import type { GatewayResource } from './registry'

interface Waiter {
  resolve: (resource: GatewayResource) => void
  reject: (error: unknown) => void
  removeAbortListener: () => void
  timer?: NodeJS.Timeout
}

interface SegmentEntry {
  owner?: SegmentProducerOwner
  status: SegmentResourceStatus
  resource?: GatewayResource
  error?: MediaCompatError
  waiters: Set<Waiter>
  activeRequestCount: number
  actualRange?: import('@marchen/shared/media').SegmentStoreEntrySnapshot['actualRange']
}

export interface SegmentProducerOwner {
  jobId: string
  epoch: number
}

export class SegmentWaitTimeoutError extends Error {
  constructor() {
    super('等待 HLS segment 超时')
    this.name = 'SegmentWaitTimeoutError'
  }
}

export interface AcquiredSegmentResource {
  resource: GatewayResource
  release: () => void
}

const cloneResource = (resource: GatewayResource): GatewayResource => ({ ...resource })

export class SegmentStore {
  readonly #entries = new Map<number, SegmentEntry>()
  readonly #init: SegmentEntry = {
    status: 'missing',
    waiters: new Set(),
    activeRequestCount: 0,
  }
  #productionPosition?: number
  #consumptionPosition?: number
  #downloadPosition?: number
  #lastClientActivityAt?: number
  #owner?: SegmentProducerOwner

  beginJob(owner: SegmentProducerOwner, requestedIndex: number): void {
    if (this.#owner) throw new Error('旧 Job 必须结束后才能取得生产所有权')
    this.#owner = { ...owner }
    this.markProducing(requestedIndex, owner)
    if (this.#init.status !== 'published') this.#init.owner = { ...owner }
  }

  assertJob(owner?: SegmentProducerOwner): void {
    if (owner?.epoch !== this.#owner?.epoch || owner?.jobId !== this.#owner?.jobId) {
      throw new Error('分片生产 Job 已过期')
    }
  }

  endJob(owner: SegmentProducerOwner, error: MediaCompatError): void {
    this.assertJob(owner)
    this.#owner = undefined
    for (const [index, entry] of this.#entries) {
      if (entry.owner?.epoch === owner.epoch && entry.owner.jobId === owner.jobId)
        this.fail(index, error)
    }
    if (this.#init.owner?.epoch === owner.epoch) this.failInit(error)
  }

  constructor(
    readonly sessionId: string,
    readonly timeline: HlsTimeline,
    private readonly onEvict?: (index: number) => void,
  ) {
    for (const segment of timeline.segments) {
      this.#entries.set(segment.index, {
        status: 'missing',
        waiters: new Set(),
        activeRequestCount: 0,
      })
    }
  }

  get snapshot(): SegmentStoreSnapshot {
    const entries = this.timeline.segments.map((segment) => {
      const entry = this.#entry(segment.index)
      return {
        ...segment,
        status: entry.status,
        waiterCount: entry.waiters.size,
        activeRequestCount: entry.activeRequestCount,
        sizeBytes: entry.resource?.sizeBytes,
        error: entry.error ? { ...entry.error } : undefined,
        actualRange: entry.actualRange ? structuredClone(entry.actualRange) : undefined,
      }
    })
    return {
      sessionId: this.sessionId,
      initStatus: this.#init.status,
      initWaiterCount: this.#init.waiters.size,
      initActiveRequestCount: this.#init.activeRequestCount,
      entries,
      publishedBytes:
        (this.#init.resource?.sizeBytes ?? 0) +
        entries.reduce((total, entry) => total + (entry.sizeBytes ?? 0), 0),
      productionPosition: this.#productionPosition,
      consumptionPosition: this.#consumptionPosition,
      downloadPosition: this.#downloadPosition,
      continuousPublishedEnd: this.#continuousPublishedEnd(),
      lastClientActivityAt: this.#lastClientActivityAt,
    }
  }

  reportPlaybackPosition(position: number): void {
    if (!Number.isFinite(position) || position < 0 || position > this.timeline.duration)
      throw new RangeError('播放位置不在时间线内')
    this.#consumptionPosition = position
    this.#lastClientActivityAt = Date.now()
  }

  #continuousPublishedEnd(): number | undefined {
    const position = this.#consumptionPosition
    if (position === undefined) return undefined
    let end = position
    for (const segment of this.timeline.segments) {
      if (segment.endTime <= position) continue
      if (this.#entries.get(segment.index)?.status !== 'published') break
      end = segment.endTime
    }
    return end
  }

  markProducing(index: number, owner?: SegmentProducerOwner): void {
    if (owner) this.assertJob(owner)
    const entry = this.#entry(index)
    if (entry.status === 'published') return
    entry.status = 'producing'
    entry.owner = owner ? { ...owner } : undefined
    entry.error = undefined
  }

  markInitProducing(): void {
    if (this.#init.status !== 'published') this.#init.status = 'producing'
  }

  publish(
    index: number,
    resource: GatewayResource,
    actualRange?: SegmentEntry['actualRange'],
    owner?: SegmentProducerOwner,
  ): void {
    this.assertJob(owner)
    const entry = this.#entry(index)
    if (entry.status === 'published') throw new Error(`segment ${index} 已经发布且不可覆盖`)
    this.#assertResource(resource)
    entry.status = 'published'
    entry.resource = cloneResource(resource)
    entry.actualRange = actualRange ? structuredClone(actualRange) : undefined
    entry.error = undefined
    this.#productionPosition = Math.max(
      this.#productionPosition ?? 0,
      this.timeline.segments[index]!.endTime,
    )
    this.#resolveWaiters(entry)
  }

  publishInit(resource: GatewayResource, owner?: SegmentProducerOwner): void {
    this.assertJob(owner)
    if (this.#init.status === 'published') throw new Error('init 已经发布且不可覆盖')
    this.#assertResource(resource)
    this.#init.status = 'published'
    this.#init.resource = cloneResource(resource)
    this.#init.error = undefined
    this.#resolveWaiters(this.#init)
  }

  fail(index: number, error: MediaCompatError): void {
    const entry = this.#entry(index)
    if (entry.status === 'published') return
    entry.status = 'failed'
    entry.error = { ...error }
    this.#rejectWaiters(entry, Object.assign(new Error(error.message), { detail: error }))
  }

  failInit(error: MediaCompatError): void {
    if (this.#init.status === 'published') return
    this.#init.status = 'failed'
    this.#init.error = { ...error }
    this.#rejectWaiters(this.#init, Object.assign(new Error(error.message), { detail: error }))
  }

  /** 会话终止时唤醒全部未完成 waiter；已发布/正在响应的资源保持不变。 */
  cancelPending(error: MediaCompatError): void {
    this.failInit(error)
    for (const index of this.#entries.keys()) this.fail(index, error)
  }

  waitFor(
    index: number,
    options: { signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<GatewayResource> {
    this.#lastClientActivityAt = Date.now()
    return this.#waitFor(this.#entry(index), options)
  }

  waitForInit(
    options: { signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<GatewayResource> {
    return this.#waitFor(this.#init, options)
  }

  acquire(index: number): AcquiredSegmentResource | undefined {
    this.#lastClientActivityAt = Date.now()
    const entry = this.#entry(index)
    if (entry.status !== 'published' || !entry.resource) return undefined
    entry.activeRequestCount += 1
    const segment = this.timeline.segments[index]!
    this.#downloadPosition = segment.endTime
    let released = false
    return {
      resource: cloneResource(entry.resource),
      release: () => {
        if (released) return
        released = true
        entry.activeRequestCount = Math.max(0, entry.activeRequestCount - 1)
      },
    }
  }

  acquireInit(): AcquiredSegmentResource | undefined {
    this.#lastClientActivityAt = Date.now()
    if (this.#init.status !== 'published' || !this.#init.resource) return undefined
    this.#init.activeRequestCount += 1
    let released = false
    return {
      resource: cloneResource(this.#init.resource),
      release: () => {
        if (released) return
        released = true
        this.#init.activeRequestCount = Math.max(0, this.#init.activeRequestCount - 1)
      },
    }
  }

  evict(index: number): boolean {
    return this.evictAndTakeResource(index) !== undefined
  }

  /** 原子标记为已驱逐并移交内部资源，供 Main 安全删除对应文件。 */
  evictAndTakeResource(index: number): GatewayResource | undefined {
    const entry = this.#entry(index)
    if (entry.activeRequestCount > 0 || entry.waiters.size > 0 || entry.status !== 'published') {
      return undefined
    }
    const resource = entry.resource ? cloneResource(entry.resource) : undefined
    if (!resource) return undefined
    entry.status = 'evicted'
    entry.resource = undefined
    entry.actualRange = undefined
    entry.error = undefined
    this.onEvict?.(index)
    return resource
  }

  #entry(index: number): SegmentEntry {
    const entry = this.#entries.get(index)
    if (!entry) throw new RangeError(`未知 HLS segment index：${index}`)
    return entry
  }

  #assertResource(resource: GatewayResource): void {
    if (!resource.complete || !resource.path || !resource.mimeType || !resource.cacheControl) {
      throw new Error('SegmentStore 只能发布完整资源')
    }
  }

  #waitFor(
    entry: SegmentEntry,
    options: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<GatewayResource> {
    if (entry.status === 'published' && entry.resource) {
      return Promise.resolve(cloneResource(entry.resource))
    }
    if (entry.status === 'failed') {
      return Promise.reject(Object.assign(new Error(entry.error?.message), { detail: entry.error }))
    }
    if (options.signal?.aborted)
      return Promise.reject(options.signal.reason ?? new Error('cancelled'))
    return new Promise<GatewayResource>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        removeAbortListener: () => undefined,
      }
      const cleanup = () => {
        entry.waiters.delete(waiter)
        waiter.removeAbortListener()
        if (waiter.timer) clearTimeout(waiter.timer)
      }
      const onAbort = () => {
        cleanup()
        reject(options.signal?.reason ?? new Error('cancelled'))
      }
      options.signal?.addEventListener('abort', onAbort, { once: true })
      waiter.removeAbortListener = () => options.signal?.removeEventListener('abort', onAbort)
      if (options.timeoutMs !== undefined) {
        waiter.timer = setTimeout(() => {
          cleanup()
          reject(new SegmentWaitTimeoutError())
        }, options.timeoutMs)
        waiter.timer.unref()
      }
      waiter.resolve = (resource) => {
        cleanup()
        resolve(resource)
      }
      waiter.reject = (error) => {
        cleanup()
        reject(error)
      }
      entry.waiters.add(waiter)
    })
  }

  #resolveWaiters(entry: SegmentEntry): void {
    if (!entry.resource) return
    for (const waiter of [...entry.waiters]) waiter.resolve(cloneResource(entry.resource))
  }

  #rejectWaiters(entry: SegmentEntry, error: unknown): void {
    for (const waiter of [...entry.waiters]) waiter.reject(error)
  }
}
