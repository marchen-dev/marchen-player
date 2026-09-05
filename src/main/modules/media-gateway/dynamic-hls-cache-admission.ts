import type { MediaSessionCache } from '../ffmpeg/cache'
import type { DynamicHlsProductionRequester } from './dynamic-hls-coordinator'

export interface DynamicHlsCacheAdmissionOptions {
  cache: Pick<MediaSessionCache, 'reserve'>
  producer: DynamicHlsProductionRequester
  estimateBytes?: (segmentIndex: number) => number
}

/**
 * 第一阶段只在启动/继续 Job 前做会话预算与磁盘下限门禁。
 * 它不调用 SegmentStore.evict，因此已发布的旧分片不会为了继续生产而被删除。
 */
export const withDynamicHlsCacheAdmission = (
  options: DynamicHlsCacheAdmissionOptions,
): DynamicHlsProductionRequester => ({
  request: async (segmentIndex) => {
    const estimatedBytes = options.estimateBytes?.(segmentIndex) ?? 0
    if (!Number.isSafeInteger(estimatedBytes) || estimatedBytes < 0) {
      throw new TypeError('Dynamic HLS segment 预估字节数无效')
    }
    await options.cache.reserve(estimatedBytes)
    await options.producer.request(segmentIndex)
  },
})
