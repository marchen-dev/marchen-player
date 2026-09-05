import type { PipelineFingerprint, PipelineRuntimeChoice } from '@marchen/shared/media'
import { describe, expect, it, vi } from 'vitest'
import { PlaybackJobManager } from './playback-job-manager'
import { createClosedGopTimeline } from './hls-timeline'
import { SegmentStore } from './segment-store'

const pipeline: PipelineFingerprint = {
  schemaVersion: 1,
  algorithm: 'sha256',
  value: 'pipeline',
}
const runtime: PipelineRuntimeChoice = {
  videoDecoder: { name: 'hevc', class: 'software' },
  videoEncoder: { name: 'libx264', class: 'software' },
  audioEncoder: { name: 'aac', class: 'software' },
}

const createManager = () =>
  new PlaybackJobManager({
    id: 'job-1',
    sessionId: 'session-1',
    pipeline,
    runtime,
    coverage: { startSegment: 4 },
    requestedStartTime: 8,
    audioOutput: { channels: 2, sampleRate: 48_000, bitRate: 192_000 },
  })

describe('PlaybackJobManager', () => {
  it('只按调度和运行证据推进完整状态机', () => {
    const manager = createManager()
    const phases: string[] = []
    manager.subscribe((snapshot) => phases.push(snapshot.phase))

    expect(manager.snapshot.phase).toBe('idle')
    manager.requestStart()
    manager.reportProducingEvidence(100)
    manager.reportThrottledEvidence()
    manager.reportResumedEvidence()
    manager.requestStop()
    manager.reportStoppedEvidence({ stoppedAt: 200, exitCode: 0 })

    expect(phases).toEqual([
      'starting',
      'producing',
      'throttled',
      'producing',
      'stopping',
      'stopped',
    ])
    expect(manager.snapshot).toMatchObject({
      phase: 'stopped',
      startedAt: 100,
      stoppedAt: 200,
      exitCode: 0,
    })
  })

  it('拒绝没有对应证据的跳转，停止请求保持幂等', () => {
    const manager = createManager()
    expect(() => manager.reportProducingEvidence()).toThrow('idle 进入 producing')
    manager.requestStart()
    expect(() => manager.reportThrottledEvidence()).toThrow('starting 进入 throttled')
    manager.reportProducingEvidence()
    manager.requestStop()
    expect(() => manager.requestStop()).not.toThrow()
    manager.reportStoppedEvidence()
    expect(() => manager.requestStart()).toThrow('stopped 进入 starting')
  })

  it('运行失败进入终态并只对外暴露脱敏错误和副本', () => {
    const manager = createManager()
    const listener = vi.fn()
    manager.subscribe(listener)
    manager.requestStart()
    manager.reportFailure({
      code: 'generation-failed',
      stage: 'transcode',
      message: '读取 /Volumes/private/movie.mkv 失败',
      stderrTail: `${'x'.repeat(9_000)} at /Users/example/cache/job-1`,
      recoverable: true,
      exitCode: 1,
    })
    const snapshot = manager.snapshot
    expect(snapshot).toMatchObject({ phase: 'failed', exitCode: 1 })
    expect(snapshot.error?.message).not.toContain('/Volumes/private')
    expect(snapshot.error?.stderrTail).not.toContain('/Users/example')
    expect(snapshot.error?.stderrTail?.length).toBeLessThanOrEqual(8 * 1024)
    snapshot.coverage.startSegment = 99
    expect(manager.snapshot.coverage.startSegment).toBe(4)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(() => manager.reportStoppedEvidence()).toThrow('failed 进入 stopped')
  })

  it('快照记录 pipeline、runtime、音频输出与已校准的 coverage', () => {
    const manager = createManager()
    manager.requestStart()
    manager.reportProducingEvidence(100)
    manager.reportCoverageEvidence({
      coverage: { startSegment: 4, endSegment: 8 },
      actualFirstPts: 8.04,
    })
    expect(manager.snapshot).toMatchObject({
      id: 'job-1',
      sessionId: 'session-1',
      pipeline,
      runtime,
      audioOutput: { channels: 2, sampleRate: 48_000, bitRate: 192_000 },
      coverage: { startSegment: 4, endSegment: 8 },
      requestedStartTime: 8,
      actualFirstPts: 8.04,
    })
    expect(() =>
      manager.reportCoverageEvidence({ coverage: { startSegment: 8, endSegment: 7 } }),
    ).toThrow('coverage 无效')
  })

  it('原子汇总 init/segment 活动引用、waiter 与单调 heartbeat', async () => {
    const manager = createManager()
    manager.requestStart()
    manager.reportProducingEvidence(100)
    const store = new SegmentStore(
      'session-1',
      createClosedGopTimeline({ sourceStartTime: 0, duration: 6, targetSegmentDuration: 2 }),
    )
    store.publishInit({
      path: '/cache/init.mp4',
      mimeType: 'video/mp4',
      cacheControl: 'private',
      complete: true,
    })
    store.publish(0, {
      path: '/cache/segment-0.m4s',
      mimeType: 'video/iso.segment',
      cacheControl: 'private',
      complete: true,
    })
    const init = store.acquireInit()!
    store.reportPlaybackPosition(2)
    const segment = store.acquire(0)!
    const controller = new AbortController()
    const waiting = store.waitFor(1, { signal: controller.signal })

    expect(manager.reportActivityEvidence(store.snapshot, 200)).toMatchObject({
      activeRequestCount: 2,
      waiterCount: 1,
      lastHeartbeatAt: 200,
      consumptionPosition: 2,
    })
    expect(() => manager.reportActivityEvidence(store.snapshot, 199)).toThrow('heartbeat')
    init.release()
    segment.release()
    controller.abort(new Error('cancelled'))
    await expect(waiting).rejects.toThrow('cancelled')
    expect(manager.reportActivityEvidence(store.snapshot, 201)).toMatchObject({
      activeRequestCount: 0,
      waiterCount: 0,
    })
  })

  it('用 FFmpeg progress 与 HLS 请求位置计算生产、消费、ahead 与处理倍速', () => {
    const manager = createManager()
    manager.requestStart()
    manager.reportProducingEvidence(100)
    const store = new SegmentStore(
      'session-1',
      createClosedGopTimeline({ sourceStartTime: 0, duration: 20, targetSegmentDuration: 2 }),
    )
    store.publish(1, {
      path: '/cache/segment-1.m4s',
      mimeType: 'video/iso.segment',
      cacheControl: 'private',
      complete: true,
    })
    store.acquire(1)?.release()
    store.reportPlaybackPosition(4)
    expect(
      manager.reportProgressEvidence(
        { out_time_us: '4000000', speed: '3.25x' },
        store.snapshot,
        200,
      ),
    ).toMatchObject({
      productionPosition: 12,
      consumptionPosition: 4,
      aheadDuration: 0,
      processingSpeed: 3.25,
      lastProgressAt: 200,
    })
  })
})
