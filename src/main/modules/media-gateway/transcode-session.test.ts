import type { FfmpegExecution, FfmpegExecutionResult } from '../ffmpeg/executor'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { MediaCacheManager } from '../ffmpeg/cache'
import { FfmpegExecutionError } from '../ffmpeg/executor'
import { TranscodeSession } from './transcode-session'

const temporaryDirectories: string[] = []
afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

const deferredExecution = () => {
  let resolve!: (value: FfmpegExecutionResult) => void
  let reject!: (reason: unknown) => void
  const result = new Promise<FfmpegExecutionResult>((resolve_, reject_) => {
    resolve = resolve_
    reject = reject_
  })
  const execution: FfmpegExecution = { result, cancel: vi.fn() }
  return { execution, resolve, reject }
}

const setup = async (sessionBudgetBytes?: number) => {
  const root = await mkdtemp(join(tmpdir(), 'marchen-transcode-session-'))
  temporaryDirectories.push(root)
  const cacheManager = new MediaCacheManager({
    root,
    sessionBudgetBytes,
    minimumFreeBytes: 0,
    freeSpace: async () => Number.MAX_SAFE_INTEGER,
  })
  const session = new TranscodeSession({
    id: 'session-1',
    logicalSourceId: 'hash-1',
    mode: 'remux',
    originalStartTime: 5,
    requestedStartTime: 12,
    cacheManager,
  })
  return { root, session }
}

describe('转码会话状态机', () => {
  it('独立目录、进度、ready 与完成状态可观察', async () => {
    const { root, session } = await setup()
    const pending = deferredExecution()
    const events: string[] = []
    session.subscribe((event) => {
      events.push(
        event.type === 'session-changed'
          ? `session:${event.session.status}`
          : `generation:${event.generation.status}`,
      )
    })

    await session.start(({ directory, reportProgress, recordFirstTimestamp, markReady }) => {
      expect(directory).toMatch(/session-[^/]+\/generation-0$/)
      reportProgress({ out_time_us: '2500000', total_size: '4096' })
      recordFirstTimestamp(0.04)
      markReady({
        id: 'lease-1',
        logicalSourceId: 'hash-1',
        mode: 'remux',
        transport: 'hls',
        url: 'http://127.0.0.1/hls',
        sessionId: 'session-1',
        generation: 0,
        timeline: { originalDuration: 120, offset: 12, calibrated: false },
      })
      return pending.execution
    })

    expect(session.session.status).toBe('ready')
    expect(session.session.phase).toBe('producer-ready')
    expect(session.acknowledge('attaching').phase).toBe('attaching')
    expect(session.acknowledge('playable').phase).toBe('playable')
    expect(session.generation).toMatchObject({
      status: 'producing',
      producedDuration: 2.5,
      bytesWritten: 4096,
      actualFirstTimestamp: 0.04,
    })
    pending.resolve({ code: 0, signal: null, stdout: Buffer.alloc(0), stderr: '', durationMs: 1 })
    await pending.execution.result
    await vi.waitFor(() => expect(session.generation.status).toBe('finished'))
    expect(events).toContain('session:running')
    expect(events).toContain('session:ready')
    expect((await readdir(root)).length).toBe(1)
    await session.release()
    expect(await readdir(root)).toEqual([])
  })

  it('release 取消生产者、清理目录并进入 released', async () => {
    const { root, session } = await setup()
    const pending = deferredExecution()
    pending.execution.cancel = vi.fn(() => pending.reject(new Error('cancelled')))
    await session.start(() => pending.execution)
    await session.release()
    expect(pending.execution.cancel).toHaveBeenCalledOnce()
    expect(session.session.status).toBe('released')
    expect(session.session.phase).toBe('released')
    expect(session.generation.status).toBe('cancelled')
    expect(await readdir(root)).toEqual([])
  })

  it('没有 Producer 证据时拒绝直接进入 attaching/playable', async () => {
    const { session } = await setup()
    expect(() => session.acknowledge('attaching')).toThrow('Producer')
    expect(() => session.acknowledge('playable')).toThrow('attaching')
    await session.release()
  })

  it('浏览器失败回执终止生产者并保留 decode 阶段错误', async () => {
    const { session } = await setup()
    const pending = deferredExecution()
    pending.execution.cancel = vi.fn(() => pending.reject(new Error('browser failed')))
    await session.start(({ markReady }) => {
      markReady({
        id: 'lease-1',
        logicalSourceId: 'hash-1',
        mode: 'transcode-video',
        transport: 'hls',
        url: 'http://127.0.0.1/hls',
        sessionId: 'session-1',
        generation: 0,
        timeline: { originalDuration: 120, offset: 0, calibrated: true },
      })
      return pending.execution
    })
    session.acknowledge('failed', {
      code: 'decode-failed',
      stage: 'decode',
      message: '浏览器没有解码首帧',
      recoverable: true,
    })
    expect(pending.execution.cancel).toHaveBeenCalledOnce()
    expect(session.session).toMatchObject({
      status: 'failed',
      phase: 'failed',
      error: { code: 'decode-failed', stage: 'decode' },
    })
    await pending.execution.result.catch(() => undefined)
    await session.release()
  })

  it('生产失败进入 failed 并保留可诊断错误', async () => {
    const { session } = await setup()
    const pending = deferredExecution()
    await session.start(() => pending.execution)
    pending.reject(new Error('encoder initialization failed'))
    await pending.execution.result.catch(() => {})
    await vi.waitFor(() => expect(session.session.status).toBe('failed'))
    expect(session.session.error).toMatchObject({
      code: 'generation-failed',
      cause: 'encoder initialization failed',
    })
    await session.release()
  })

  it('fFmpeg 失败保留 transcode 阶段、退出码与有界 stderr 尾部', async () => {
    const { session } = await setup()
    const pending = deferredExecution()
    await session.start(() => pending.execution)
    pending.reject(
      new FfmpegExecutionError('transcode failed', {
        failure: 'exit',
        code: 69,
        stderr: `${'x'.repeat(10_000)}important-tail`,
        durationMs: 10,
      }),
    )
    await pending.execution.result.catch(() => {})
    await vi.waitFor(() => expect(session.session.status).toBe('failed'))
    expect(session.session.error).toMatchObject({
      code: 'generation-failed',
      stage: 'transcode',
      exitCode: 69,
      cause: 'transcode failed',
    })
    expect(session.session.error?.stderrTail?.endsWith('important-tail')).toBe(true)
    expect(session.session.error?.stderrTail?.length).toBeLessThanOrEqual(8 * 1024)
    await session.release()
  })

  it('生产期间超过缓存预算时进入结构化失败并可清理', async () => {
    const { session } = await setup(64)
    await session.start(({ directory, ensureCacheBudget }) => ({
      result: writeFile(join(directory, 'oversized.m4s'), Buffer.alloc(128)).then(async () => {
        await ensureCacheBudget()
        return { code: 0, signal: null, stdout: Buffer.alloc(0), stderr: '', durationMs: 1 }
      }),
      cancel: vi.fn(),
    }))
    await vi.waitFor(() => expect(session.session.status).toBe('failed'))
    expect(session.session.error).toMatchObject({ code: 'cache-budget-exceeded' })
    await session.release()
  })
})
