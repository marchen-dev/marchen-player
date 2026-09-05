import type { MediaCompatError, PrepareMediaSessionRequest } from '@marchen/shared/media'
import { describe, expect, it } from 'vitest'
import { dynamicHlsFallbackRequest } from '../dynamic-hls-fallback'
const request: PrepareMediaSessionRequest = {
  requestId: 'first',
  source: {
    kind: 'electron-file',
    hash: 'fixture',
    name: 'fixture.mkv',
    path: '/fixture.mkv',
    size: 1,
  },
  startTime: 100,
  plan: {
    kind: 'copy-video-aac',
    reason: 'audio-incompatible',
    videoStreamIndex: 0,
    video: 'copy',
    startupDeadlineMs: 10000,
  },
  decision: {
    method: 'direct-stream',
    trial: false,
    container: { action: 'remux', target: 'fmp4-hls' },
    video: { action: 'copy', streamIndex: 0, sourceCodec: 'hevc' },
    subtitle: { action: 'external-render' },
    reasons: [],
  },
}
describe('Dynamic HLS 明确 transport 回退', () => {
  it('关键帧准备失败可回退，但取消即使带相同 reason 也不能重试', () => {
    const error: MediaCompatError = {
      code: 'generation-failed',
      stage: 'planning',
      message: '关键帧不可用',
      recoverable: true,
      compatibilityReason: {
        code: 'keyframe-timeline-unavailable',
        domain: 'video',
        source: 'target-probe',
      },
    }
    expect(dynamicHlsFallbackRequest(request, error, 'second')?.legacyTransportReason).toBe(
      'keyframe-timeline-unavailable',
    )
    expect(
      dynamicHlsFallbackRequest(request, { ...error, code: 'cancelled' }, 'second'),
    ).toBeUndefined()
  })
  it('只重试一次，保留原决策和逻辑时间', () => {
    const error: MediaCompatError = {
      code: 'hls-timeline-unavailable',
      message: '边界不可靠',
      recoverable: true,
    }
    const fallback = dynamicHlsFallbackRequest(request, error, 'second')!
    expect(fallback).toMatchObject({
      requestId: 'second',
      startTime: 100,
      legacyTransportReason: 'hls-timeline-unavailable',
    })
    expect(fallback.decision).toBe(request.decision)
    expect(fallback.plan).toBe(request.plan)
    expect(dynamicHlsFallbackRequest(fallback, error, 'third')).toBeUndefined()
  })
  it.each<MediaCompatError['code']>([
    'disk-space-low',
    'cache-budget-exceeded',
    'cancelled',
    'source-unavailable',
    'startup-deadline-exceeded',
    'generation-failed',
  ])('%s 不触发换 transport 或升级转码', (code) => {
    expect(
      dynamicHlsFallbackRequest(request, { code, message: 'failure', recoverable: true }, 'second'),
    ).toBeUndefined()
  })
})
