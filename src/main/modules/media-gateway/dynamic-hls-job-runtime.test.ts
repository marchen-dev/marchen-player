import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { FfmpegProcessExecutor } from '../ffmpeg/executor'
import { compileDynamicHlsJob } from './dynamic-hls-job-compiler'
import { createClosedGopTimeline } from './hls-timeline'
import { DynamicHlsSessionLifecycle } from './dynamic-hls-session-lifecycle'
import { DynamicHlsJobSlot } from './dynamic-hls-job-slot'
import { DynamicHlsRequestCoordinator } from './dynamic-hls-coordinator'
import { SegmentStore } from './segment-store'

const ffmpeg = resolve(
  'resources/ffmpeg',
  `${process.platform}-${process.arch}`,
  process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg',
)
const run = promisify(execFile)

describe.runIf(existsSync(ffmpeg))('正式 Dynamic HLS compiler 的真实进程控制', () => {
  it('生命周期取消等待真实 FFmpeg 退出，并唤醒未完成请求', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'marchen-lifecycle-process-'))
    const executor = new FfmpegProcessExecutor()
    let pid: number | undefined
    const store = new SegmentStore(
      'session',
      createClosedGopTimeline({ sourceStartTime: 0, duration: 30, targetSegmentDuration: 2 }),
    )
    const coordinator = new DynamicHlsRequestCoordinator()
    const slot = new DynamicHlsJobSlot({
      store,
      factory: {
        start: async ({ owner }) => {
          const execution = executor.start({
            executable: ffmpeg,
            arguments: [
              '-hide_banner',
              '-loglevel',
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
            gracefulStdin: true,
            gracefulShutdownMs: 1_000,
          })
          pid = execution.pid
          // 立即挂 rejection handler，取消也必须等待 close 确认而非仅发信号。
          const exited = execution.result.catch(() => undefined)
          return {
            id: owner.jobId,
            coverage: { startSegment: 0 },
            stop: async () => {
              execution.stop()
              await exited
            },
          }
        },
      },
    })
    const lifecycle = new DynamicHlsSessionLifecycle({
      token: 'token',
      store,
      coordinator,
      jobSlot: slot,
    })
    coordinator.register('token', store, {
      request: async (index) => {
        await slot.ensure(index)
      },
    })
    try {
      await slot.ensure(0)
      expect(pid).toBeGreaterThan(0)
      process.kill(pid!, 0)
      const waiting = coordinator.requestSegment('token', 1)
      const rejected = expect(waiting).rejects.toMatchObject({ detail: { code: 'cancelled' } })
      await lifecycle.handle('renderer-crash')
      await rejected
      expect(() => process.kill(pid!, 0)).toThrow()
      await expect(slot.ensure(1)).rejects.toThrow('已关闭')
    } finally {
      await lifecycle.handle('release')
      await rm(directory, { recursive: true, force: true })
    }
  }, 10_000)

  it('bundled FFmpeg 读取 stdin q 后正常退出并保留已完成输出', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'marchen-job-stop-'))
    try {
      const input = join(directory, 'input.mp4')
      await run(ffmpeg, [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=160x90:rate=24',
        '-t',
        '20',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-g',
        '48',
        '-y',
        input,
      ])
      const job = compileDynamicHlsJob({
        inputPath: input,
        outputDirectory: directory,
        segmentIndex: 0,
        timeline: createClosedGopTimeline({
          sourceStartTime: 0,
          duration: 20,
          targetSegmentDuration: 2,
        }),
        pipeline: {
          kind: 'remux',
          plan: {
            kind: 'remux',
            reason: 'container-incompatible',
            videoStreamIndex: 0,
            video: 'copy',
            audio: 'copy',
          },
        },
      })
      expect(job.preset.arguments).not.toContain('-nostdin')
      expect(job.preset.arguments).toContain('movflags=+frag_discont+skip_sidx')
      const arguments_ = [...job.preset.arguments]
      // 仅测试输入限速，保证停止发生于真实生产期间。
      arguments_.splice(arguments_.indexOf('-i'), 0, '-re')
      const executor = new FfmpegProcessExecutor()
      const execution = executor.start({
        executable: ffmpeg,
        arguments: arguments_,
        inputs: job.preset.inputs,
        gracefulStdin: job.gracefulStdin,
        gracefulShutdownMs: 2_000,
        timeoutMs: 10_000,
        progress: true,
        onProgress: (record) => {
          if (Number(record.out_time_us) >= 2_000_000) execution.stop()
        },
      })
      await expect(execution.result).resolves.toMatchObject({ code: 0, signal: null })
      expect(existsSync(job.preset.output.initPath)).toBe(true)
      expect(existsSync(job.preset.output.manifestPath)).toBe(true)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 15_000)
})
