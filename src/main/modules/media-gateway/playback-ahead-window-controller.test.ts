import type { FfmpegExecutionResult } from '../ffmpeg/executor'
import type { SegmentStoreSnapshot } from '@marchen/shared/media'
import { describe, expect, it, vi } from 'vitest'
import { PlaybackAheadWindowController } from './playback-ahead-window-controller'
import { PlaybackJobManager } from './playback-job-manager'

const result: FfmpegExecutionResult = {
  code: 0,
  signal: null,
  stdout: Buffer.alloc(0),
  stderr: '',
  durationMs: 1,
}

const store = (consumptionPosition: number): SegmentStoreSnapshot => ({
  sessionId: 'session',
  initStatus: 'published',
  initWaiterCount: 0,
  initActiveRequestCount: 0,
  publishedBytes: 20,
  consumptionPosition,
  continuousPublishedEnd: 62,
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
    {
      index: 31,
      startTime: 62,
      duration: 2,
      endTime: 64,
      keyframeAligned: true,
      tail: false,
      status: 'missing',
      waiterCount: 0,
      activeRequestCount: 0,
    },
  ],
})

const setup = (ahead: number) => {
  const manager = new PlaybackJobManager({
    id: 'job',
    sessionId: 'session',
    pipeline: { schemaVersion: 1, algorithm: 'sha256', value: 'pipeline' },
    runtime: { videoEncoder: { name: 'libx264', class: 'software' } },
    coverage: { startSegment: 0 },
    requestedStartTime: 0,
  })
  manager.requestStart()
  manager.reportProducingEvidence(100)
  manager.reportProgressEvidence(
    { out_time_us: String((ahead + 2) * 1_000_000), speed: '8x' },
    { ...store(2), continuousPublishedEnd: ahead + 2 },
    101,
  )
  const execution = { result: Promise.resolve(result), stop: vi.fn() }
  return { manager, execution }
}

describe('PlaybackAheadWindowController', () => {
  it('已验证 pause/resume 时在 60 秒节流、20 秒恢复', async () => {
    const { manager, execution } = setup(60)
    const pauseResume = { pause: vi.fn(async () => true), resume: vi.fn(async () => true) }
    const controller = new PlaybackAheadWindowController({ manager, execution, pauseResume })
    await expect(controller.evaluate(store(2))).resolves.toEqual({ kind: 'throttled' })
    expect(manager.snapshot.phase).toBe('throttled')
    manager.reportProgressEvidence({}, store(42), 102)
    await expect(controller.evaluate(store(42))).resolves.toEqual({ kind: 'resumed' })
    expect(manager.snapshot.phase).toBe('producing')
    expect(execution.stop).not.toHaveBeenCalled()
  })

  it('平台无可靠 pause 时停止 Job 并返回下一个未发布 segment', async () => {
    const { manager, execution } = setup(60)
    const controller = new PlaybackAheadWindowController({ manager, execution })
    await expect(controller.evaluate(store(2))).resolves.toEqual({
      kind: 'stopped',
      resumeFromSegment: 31,
    })
    expect(execution.stop).toHaveBeenCalledOnce()
    expect(manager.snapshot.phase).toBe('stopped')
  })

  it('90 秒硬上限不依赖 pause，直接停止无界生产', async () => {
    const { manager, execution } = setup(90)
    const pauseResume = { pause: vi.fn(async () => true), resume: vi.fn(async () => true) }
    const controller = new PlaybackAheadWindowController({ manager, execution, pauseResume })
    await expect(controller.evaluate(store(2))).resolves.toMatchObject({ kind: 'stopped' })
    expect(pauseResume.pause).not.toHaveBeenCalled()
    expect(execution.stop).toHaveBeenCalledOnce()
  })
})
