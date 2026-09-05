import type { FfmpegExecutionResult } from '../ffmpeg/executor'
import { describe, expect, it, vi } from 'vitest'
import { PlaybackJobIdleController } from './playback-job-idle-controller'
import { PlaybackJobManager } from './playback-job-manager'

const result: FfmpegExecutionResult = {
  code: 0,
  signal: null,
  stdout: Buffer.alloc(0),
  stderr: '',
  durationMs: 1,
}

const setup = () => {
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
  let resolve!: (value: FfmpegExecutionResult) => void
  const execution = {
    result: new Promise<FfmpegExecutionResult>((done) => {
      resolve = done
    }),
    stop: vi.fn(() => resolve(result)),
  }
  return {
    manager,
    execution,
    controller: new PlaybackJobIdleController({ manager, execution, idleTimeoutMs: 60 }),
  }
}

describe('PlaybackJobIdleController', () => {
  it('未达空闲期限或仍有活动引用时不停止', async () => {
    const { manager, execution, controller } = setup()
    expect(await controller.check(159)).toBe(false)
    manager.reportActivityEvidence(
      {
        sessionId: 'session',
        initStatus: 'missing',
        initWaiterCount: 0,
        initActiveRequestCount: 1,
        entries: [],
        publishedBytes: 0,
      },
      160,
    )
    expect(await controller.check(500)).toBe(false)
    expect(execution.stop).not.toHaveBeenCalled()
  })

  it('超过空闲期限后只请求一次优雅停止并以进程退出证据结束', async () => {
    const { manager, execution, controller } = setup()
    const [first, second] = await Promise.all([controller.check(160), controller.check(160)])
    expect([first, second]).toEqual([true, true])
    expect(execution.stop).toHaveBeenCalledOnce()
    expect(manager.snapshot).toMatchObject({ phase: 'stopped', exitCode: 0 })
  })
  it('无客户端时持续 FFmpeg progress 不延长空闲期限', async () => {
    const { manager, execution, controller } = setup()
    manager.reportProgressEvidence(
      { out_time_us: '2000000', speed: '2x' },
      {
        sessionId: 'session',
        initStatus: 'published',
        initWaiterCount: 0,
        initActiveRequestCount: 0,
        entries: [],
        publishedBytes: 0,
      },
      159,
    )
    expect(manager.snapshot.lastHeartbeatAt).toBeUndefined()
    expect(manager.snapshot.lastProgressAt).toBe(159)
    expect(await controller.check(160)).toBe(true)
    expect(execution.stop).toHaveBeenCalledOnce()
  })
})
