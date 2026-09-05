import type { MediaCompatError } from '@marchen/shared/media'
import type { DynamicHlsRequestCoordinator } from './dynamic-hls-coordinator'
import type { DynamicHlsJobSlot } from './dynamic-hls-job-slot'
import type { MediaSourceIntegrityMonitor } from './resilience'
import { SegmentStore } from './segment-store'

export type DynamicHlsLifecycleEvent =
  'sleep' | 'wake' | 'source-switch' | 'release' | 'renderer-crash' | 'window-close' | 'app-quit'

export interface DynamicHlsSessionLifecycleOptions {
  token: string
  store: SegmentStore
  coordinator: DynamicHlsRequestCoordinator
  jobSlot: Pick<DynamicHlsJobSlot, 'close'>
  source?: MediaSourceIntegrityMonitor
}

const cancelledError = (event: DynamicHlsLifecycleEvent): MediaCompatError => ({
  code: 'cancelled',
  stage: 'cleanup',
  message: `Dynamic HLS 会话因 ${event} 结束`,
  recoverable: event !== 'app-quit',
})

/** 将 Electron 外部生命周期事件收敛为单次、可等待的 Job/waiter 取消。 */
export class DynamicHlsSessionLifecycle {
  #releasePromise?: Promise<void>

  constructor(private readonly options: DynamicHlsSessionLifecycleOptions) {}

  get released(): boolean {
    return this.#releasePromise !== undefined
  }

  handle(event: DynamicHlsLifecycleEvent): Promise<void> {
    return this.#release(cancelledError(event))
  }

  async checkSource(): Promise<'unchanged' | 'released'> {
    if (this.released) return 'released'
    const integrity = await this.options.source?.check()
    if (!integrity || integrity.status === 'unchanged') return 'unchanged'
    await this.#release(integrity.error)
    return 'released'
  }

  #release(error: MediaCompatError): Promise<void> {
    this.#releasePromise ??= Promise.resolve().then(async () => {
      // 先从路由表移除，防止取消期间又进入新 waiter。
      this.options.coordinator.unregister(this.options.token)
      this.options.store.cancelPending(error)
      await this.options.jobSlot.close()
    })
    return this.#releasePromise
  }
}
