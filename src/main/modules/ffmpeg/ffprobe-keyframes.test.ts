import type { FfmpegExecutionOptions, FfmpegExecutionResult } from './executor'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { FfmpegProcessExecutor } from './executor'
import { extractKeyframesWithFfprobe } from './ffprobe-keyframes'
import { FfmpegTaskScheduler } from './scheduler'

const success = (value: unknown): FfmpegExecutionResult => ({
  code: 0,
  signal: null,
  stdout: Buffer.from(JSON.stringify(value)),
  stderr: '',
  durationMs: 1,
})

describe('ffprobe 关键帧 fallback', () => {
  it('使用低优先级、有界、可取消的 bundled probe 参数并归一时间', async () => {
    const calls: FfmpegExecutionOptions[] = []
    const scheduled: Array<{ kind: string; weight?: string }> = []
    const result = await extractKeyframesWithFfprobe({
      ffprobe: '/runtime/ffprobe',
      executor: {
        run: async (options) => {
          calls.push(options)
          return success({
            streams: [{ start_time: '5.000' }],
            format: { start_time: '5.000', duration: '35.000' },
            packets: [
              { pts_time: '5.000', flags: 'K_' },
              { pts_time: '15.000', flags: 'K_' },
              { pts_time: '25.000', flags: 'K_' },
            ],
          })
        },
      },
      scheduler: {
        schedule: async (options) => {
          scheduled.push(options)
          return options.run(new AbortController().signal)
        },
      } as Pick<FfmpegTaskScheduler, 'schedule'>,
      inputPath: '/video/vfr.mkv',
      videoStreamIndex: 3,
    })

    expect(result).toEqual({
      sourceStartTime: 5,
      duration: 30,
      durationReliable: true,
      keyframes: [0, 10, 20],
    })
    expect(scheduled).toEqual([expect.objectContaining({ kind: 'keyframe', weight: 'light' })])
    expect(calls[0]).toMatchObject({
      inputs: ['/video/vfr.mkv'],
      allowedInputProtocols: ['file'],
      timeoutMs: 8_000,
      stdoutLimitBytes: 8 * 1024 * 1024,
      stderrLimitBytes: 16 * 1024,
    })
    expect(calls[0].arguments).toEqual(expect.arrayContaining(['-skip_frame', 'nokey', '3']))
  })

  it('取消信号交给调度器且不绕过任务生命周期', async () => {
    const scheduler = new FfmpegTaskScheduler()
    const controller = new AbortController()
    controller.abort()
    const executor = { run: vi.fn() }
    await expect(
      extractKeyframesWithFfprobe({
        ffprobe: '/runtime/ffprobe',
        executor,
        scheduler,
        inputPath: '/video.mkv',
        videoStreamIndex: 0,
        signal: controller.signal,
      }),
    ).rejects.toThrow('取消')
    expect(executor.run).not.toHaveBeenCalled()
  })

  it('容器时长远超最后关键帧时标记不可靠', async () => {
    const result = await extractKeyframesWithFfprobe({
      ffprobe: '/runtime/ffprobe',
      executor: {
        run: async () =>
          success({
            format: { duration: '120' },
            packets: [
              { pts_time: '0', flags: 'K_' },
              { pts_time: '10', flags: 'K_' },
            ],
          }),
      },
      scheduler: {
        schedule: (options) => options.run(new AbortController().signal),
      } as Pick<FfmpegTaskScheduler, 'schedule'>,
      inputPath: '/video.mkv',
      videoStreamIndex: 0,
    })
    expect(result.durationReliable).toBe(false)
  })
})

const ffprobe = resolve('resources', 'ffmpeg', `${process.platform}-${process.arch}`, 'ffprobe')
const fixture = resolve('test-results/media-compat/structure-h264-vfr-nonzero-start-long-gop.mp4')
describe.runIf(existsSync(ffprobe) && existsSync(fixture))('真实 ffprobe 关键帧 fallback', () => {
  it('读取 MP4 VFR/非零起点关键帧', async () => {
    const result = await extractKeyframesWithFfprobe({
      ffprobe,
      executor: new FfmpegProcessExecutor(),
      scheduler: new FfmpegTaskScheduler(),
      inputPath: fixture,
      videoStreamIndex: 0,
    })
    expect(result.sourceStartTime).toBeCloseTo(5, 2)
    expect(result.keyframes[0]).toBe(0)
    expect(result.keyframes.at(-1)).toBeCloseTo(23.333, 2)
    expect(result.duration).toBeCloseTo(29.966, 2)
  })
})
