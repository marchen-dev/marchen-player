import type { MediaCompatError } from '@marchen/shared/media'
import type { AcquiredSegmentResource } from './segment-store'
import { SegmentStore } from './segment-store'
import { MediaCacheError } from '../ffmpeg/cache'

export interface DynamicHlsProductionRequester {
  request: (segmentIndex: number) => Promise<void> | void
}

interface DynamicSession {
  store: SegmentStore
  producer: DynamicHlsProductionRequester
  requests: Map<number, object>
}

const productionError = (error: unknown, fallback: string): MediaCompatError =>
  error instanceof MediaCacheError
    ? { code: error.code, stage: 'transcode', message: error.message, recoverable: true }
    : {
        code: 'generation-failed',
        stage: 'transcode',
        message: error instanceof Error ? error.message : fallback,
        recoverable: true,
      }

export class DynamicHlsRequestCoordinator {
  readonly #sessions = new Map<string, DynamicSession>()

  register(token: string, store: SegmentStore, producer: DynamicHlsProductionRequester): void {
    if (this.#sessions.has(token)) throw new Error('Dynamic HLS token 已经注册')
    this.#sessions.set(token, { store, producer, requests: new Map() })
  }

  unregister(token: string): void {
    this.#sessions.delete(token)
  }

  #produce(session: DynamicSession, index: number): void {
    const ticket = {}
    session.requests.set(index, ticket)
    const fail = (error: unknown) => {
      // Job 替换后的新请求拥有新 ticket，旧 Promise 的 rejection 不得反向覆盖它。
      if (session.requests.get(index) !== ticket) return
      const detail = productionError(error, 'Dynamic HLS Job 启动失败')
      if (index < 0) session.store.failInit(detail)
      else session.store.fail(index, detail)
    }
    try {
      Promise.resolve(session.producer.request(Math.max(0, index)))
        .catch(fail)
        .finally(() => {
          if (session.requests.get(index) === ticket) session.requests.delete(index)
        })
    } catch (error) {
      fail(error)
      session.requests.delete(index)
    }
  }

  async requestSegment(
    token: string,
    segmentIndex: number,
    options: { signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<AcquiredSegmentResource | undefined> {
    if (options.signal?.aborted) throw options.signal.reason ?? new Error('请求已取消')
    const session = this.#sessions.get(token)
    if (!session) return undefined
    if (!session.store.timeline.segments[segmentIndex]) return undefined
    const acquired = session.store.acquire(segmentIndex)
    if (acquired) return acquired
    const snapshot = session.store.snapshot.entries[segmentIndex]
    if (!snapshot) return undefined
    if (snapshot.status !== 'producing') {
      session.store.markProducing(segmentIndex)
      this.#produce(session, segmentIndex)
    }
    await session.store.waitFor(segmentIndex, {
      signal: options.signal,
      timeoutMs: options.timeoutMs ?? 10_000,
    })
    return session.store.acquire(segmentIndex)
  }

  async requestInit(
    token: string,
    options: { signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<AcquiredSegmentResource | undefined> {
    if (options.signal?.aborted) throw options.signal.reason ?? new Error('请求已取消')
    const session = this.#sessions.get(token)
    if (!session) return undefined
    const acquired = session.store.acquireInit()
    if (acquired) return acquired
    if (session.store.snapshot.initStatus !== 'producing') {
      session.store.markInitProducing()
      this.#produce(session, -1)
    }
    await session.store.waitForInit({
      signal: options.signal,
      timeoutMs: options.timeoutMs ?? 10_000,
    })
    return session.store.acquireInit()
  }
}
