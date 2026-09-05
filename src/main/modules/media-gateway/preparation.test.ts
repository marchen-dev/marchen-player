import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { FfmpegProcessExecutor } from '../ffmpeg/executor'
import type { FfmpegExecution } from '../ffmpeg/executor'
import { MediaSessionController } from './session-controller'
import { MediaGatewayRegistry } from './registry'
import { describe, expect, it, vi } from 'vitest'
import { cancelledPreparation, runPreparationStage } from './preparation'
import { toMediaCompatError } from './errors'

describe('Main 准备阶段期限和取消', () => {
  it('期限结束会取消底层工作，保留可跨 IPC 的具体阶段', async () => {
    vi.useFakeTimers()
    try {
      let child: AbortSignal | undefined
      const pending = runPreparationStage(
        'probe',
        (signal) => {
          child = signal
          return new Promise(() => undefined)
        },
        { deadlineMs: 50 },
      )
      const failure = pending.catch((error) =>
        toMediaCompatError(error, { code: 'unknown', message: 'unknown', recoverable: true }),
      )
      await vi.advanceTimersByTimeAsync(50)
      expect(child?.aborted).toBe(true)
      await expect(failure).resolves.toMatchObject({
        code: 'startup-deadline-exceeded',
        stage: 'probe',
        deadlineStage: 'probe',
      })
    } finally {
      vi.useRealTimers()
    }
  })
  it('已取消的准备不启动新工作', async () => {
    const parent = new AbortController()
    parent.abort(cancelledPreparation())
    const run = vi.fn(async () => undefined)
    await expect(
      runPreparationStage('preflight', run, { signal: parent.signal }),
    ).rejects.toMatchObject({ detail: { code: 'cancelled' } })
    expect(run).not.toHaveBeenCalled()
  })
})

const ffmpeg = resolve(
  'resources/ffmpeg',
  `${process.platform}-${process.arch}`,
  process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg',
)
it.runIf(existsSync(ffmpeg))(
  '取消准备会中止真实 FFmpeg，而非仅丢弃 Renderer 结果',
  async () => {
    const controller = new MediaSessionController(
      new MediaGatewayRegistry(),
      () => 'http://127.0.0.1:1',
    )
    const executor = new FfmpegProcessExecutor()
    let execution!: FfmpegExecution
    let started!: () => void
    const ready = new Promise<void>((resolve) => {
      started = resolve
    })
    const work = controller.preparation('cancel-real', (signal) =>
      runPreparationStage(
        'preflight',
        async (child) => {
          execution = executor.start({
            executable: ffmpeg,
            arguments: [
              '-v',
              'error',
              '-re',
              '-f',
              'lavfi',
              '-i',
              'testsrc2=size=160x90:rate=24',
              '-f',
              'null',
              '-',
            ],
            inputs: [],
            signal: child,
          })
          started()
          return execution.result
        },
        { signal },
      ),
    )
    const failure = work.catch((error) => error)
    await ready
    await controller.cancelPreparation('cancel-real')
    expect(await failure).toMatchObject({ detail: { code: 'cancelled' } })
    await execution.result.catch(() => undefined)
    expect(() => process.kill(execution.pid!, 0)).toThrow()
  },
  5000,
)
