import type { MediaCompatError, PrepareMediaSessionRequest } from '@marchen/shared/media'

/** 只对已确定的时间线能力失败换 transport；磁盘、权限、取消和慢请求不得触发转码。 */
export const dynamicHlsFallbackRequest = (
  request: PrepareMediaSessionRequest,
  error: MediaCompatError,
  requestId: string,
): PrepareMediaSessionRequest | undefined => {
  if (!request.decision || request.legacyTransportReason || !error.recoverable) return undefined
  const reason =
    error.code === 'hls-timeline-unavailable'
      ? 'hls-timeline-unavailable'
      : error.code === 'generation-failed' &&
          error.stage === 'planning' &&
          error.compatibilityReason?.code === 'keyframe-timeline-unavailable'
        ? 'keyframe-timeline-unavailable'
        : undefined
  return reason ? { ...request, requestId, legacyTransportReason: reason } : undefined
}
