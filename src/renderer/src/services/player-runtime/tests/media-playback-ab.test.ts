import { describe, expect, it } from 'vitest'
import { MediaPlaybackAbRecorder, resolvePlaybackAbFlags } from '../media-playback-ab'

describe('media playback A/B', () => {
  it('feature flag 只在开发态开启 shadow/v2', () => {
    const environment = {
      DEV: true,
      VITE_MEDIA_COMPAT_PLANNER: 'shadow',
      VITE_MEDIA_GATEWAY_V2: '1',
    }
    expect(resolvePlaybackAbFlags(environment)).toEqual({ plannerShadow: true, dynamicHlsV2: true })
    expect(resolvePlaybackAbFlags({ ...environment, DEV: false })).toEqual({
      plannerShadow: false,
      dynamicHlsV2: false,
    })
  })

  it('汇总 planner 行为差异与 v1/v2 首帧、seek、倍速、缓存指标', () => {
    const recorder = new MediaPlaybackAbRecorder()
    recorder.recordPlanner({
      equal: false,
      legacy: { method: 'direct-stream', reasons: [] },
      generalized: { method: 'transcode', reasons: ['video-codec-not-supported'] },
      differingFields: ['method', 'reasons'],
    })
    recorder.recordTransport({
      transport: 'v1-generation',
      outcome: 'playable',
      firstFrameMs: 8_000,
      seekResumeMs: 4_000,
      processingSpeed: 2,
      cacheBytes: 100,
    })
    recorder.recordTransport({
      transport: 'v2-stable-vod',
      outcome: 'playable',
      firstFrameMs: 2_000,
      seekResumeMs: 800,
      processingSpeed: 3,
      cacheBytes: 40,
    })
    expect(recorder.snapshot()).toMatchObject({
      planner: { samples: 1, differences: 1, differingFields: { method: 1, reasons: 1 } },
      transports: {
        'v1-generation': [{ firstFrameMs: 8_000, seekResumeMs: 4_000 }],
        'v2-stable-vod': [{ firstFrameMs: 2_000, seekResumeMs: 800 }],
      },
    })
  })
})
