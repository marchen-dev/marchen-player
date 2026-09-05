import type { PlaybackSourceLeaseDescriptor } from '@marchen/shared/media'
import { describe, expect, it } from 'vitest'
import { PlaybackPerformanceRecorder } from '../playback-performance'

describe('PlaybackPerformanceRecorder', () => {
  it('记录阶段、首帧、seek、Job 与缓存指标，不暴露敏感字段', () => {
    let now = 0
    const recorder = new PlaybackPerformanceRecorder(() => now)
    const finishProbe = recorder.beginStage('probe')
    now = 12
    finishProbe()
    const finishFirstFrame = recorder.beginStage('first-frame')
    now = 32
    finishFirstFrame()
    const finishSeek = recorder.beginSeek()
    now = 40
    finishSeek()
    const lease = {
      id: 'private-lease',
      logicalSourceId: 'private-source',
      mode: 'transcode-video',
      transport: 'hls',
      url: 'http://127.0.0.1/v2/media/private-token/index.m3u8',
      timeline: { originalDuration: 120, offset: 0, calibrated: true },
      job: {
        id: 'private-job',
        sessionId: 'private-session',
        phase: 'producing',
        pipeline: { schemaVersion: 1, algorithm: 'sha256', value: 'private-pipeline' },
        runtime: { videoEncoder: { name: 'libx264', class: 'software' } },
        coverage: { startSegment: 0 },
        requestedStartTime: 0,
        productionPosition: 60,
        consumptionPosition: 10,
        aheadDuration: 50,
        processingSpeed: 4,
        activeRequestCount: 1,
        waiterCount: 2,
      },
      segmentStore: {
        sessionId: 'private-session',
        initStatus: 'published',
        initWaiterCount: 0,
        initActiveRequestCount: 0,
        entries: [
          {
            index: 0,
            startTime: 0,
            duration: 2,
            endTime: 2,
            keyframeAligned: true,
            tail: false,
            status: 'published',
            waiterCount: 0,
            activeRequestCount: 0,
          },
        ],
        publishedBytes: 1_024,
      },
    } satisfies PlaybackSourceLeaseDescriptor
    const snapshot = recorder.snapshot(lease)
    expect(snapshot).toMatchObject({
      stageDurationsMs: { probe: 12, 'first-frame': 20 },
      firstFrameMs: 20,
      seekResumeMs: 8,
      job: { productionPosition: 60, consumptionPosition: 10, aheadDuration: 50 },
      cache: { publishedBytes: 1_024, publishedSegments: 1, evictedSegments: 0 },
    })
    expect(JSON.stringify(snapshot)).not.toMatch(/private|token|pipeline|\/v2\/media/)
  })
})
