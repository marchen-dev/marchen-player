import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'
import { FfmpegProcessExecutor } from './executor'
import { createRemuxHlsPreset } from './hls-preset'
import { calibrateGenerationTimeline, probeFirstOutputTimestamp } from './timeline-calibration'

const temporaryDirectories: string[] = []
afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

describe('generation 时间线校准', () => {
  it('把请求 seek 与实际首 PTS 合成 calibrated offset，并保留原始 start time', () => {
    expect(
      calibrateGenerationTimeline({
        originalDuration: 120,
        originalStartTime: 5,
        requestedStartTime: 30,
        actualFirstOutputTimestamp: 0.041,
      }),
    ).toEqual({
      originalStartTime: 5,
      requestedStartTime: 30,
      actualFirstOutputTimestamp: 0.041,
      timeline: { originalDuration: 120, offset: 30.041, calibrated: true },
    })
  })

  it('首 PTS 未知时明确保持未校准，不伪造精确结论', () => {
    expect(
      calibrateGenerationTimeline({
        originalDuration: 120,
        originalStartTime: 5,
        requestedStartTime: 30,
      }).timeline,
    ).toEqual({ originalDuration: 120, offset: 30, calibrated: false })
  })

  it('未结束的 EVENT 清单使用有限快照探测，不等待整部媒体完成', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'marchen-timeline-snapshot-'))
    temporaryDirectories.push(outputDirectory)
    const manifestPath = join(outputDirectory, 'index.m3u8')
    await writeFile(
      manifestPath,
      '#EXTM3U\n#EXT-X-PLAYLIST-TYPE:EVENT\n#EXTINF:2,\nsegment-00000.m4s\n',
    )
    let probePath = ''
    const timestamp = await probeFirstOutputTimestamp({
      ffprobe: '/runtime/ffprobe',
      manifestPath,
      executor: {
        run: async (options) => {
          probePath = options.inputs?.[0] ?? ''
          expect(probePath).not.toBe(manifestPath)
          expect(await readFile(probePath, 'utf8')).toContain('#EXT-X-ENDLIST')
          return {
            code: 0,
            signal: null,
            stdout: Buffer.from('{"packets":[{"pts_time":"0.041"}]}'),
            stderr: '',
            durationMs: 1,
          }
        },
      },
    })
    expect(timestamp).toBe(0.041)
    await expect(readFile(probePath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

const runtimeDirectory = resolve('resources', 'ffmpeg', `${process.platform}-${process.arch}`)
const suffix = process.platform === 'win32' ? '.exe' : ''
const ffmpeg = join(runtimeDirectory, `ffmpeg${suffix}`)
const ffprobe = join(runtimeDirectory, `ffprobe${suffix}`)
const fixture = resolve('test-results/media-compat/vfr-nonzero-start.mkv')

describe.runIf(existsSync(ffmpeg) && existsSync(ffprobe) && existsSync(fixture))(
  '真实 VFR/非零 start time 校准',
  () => {
    it('可从 fMP4 HLS 读取有限首 PTS 并形成校准时间线', async () => {
      const outputDirectory = await mkdtemp(join(tmpdir(), 'marchen-timeline-calibration-'))
      temporaryDirectories.push(outputDirectory)
      const preset = createRemuxHlsPreset({
        inputPath: fixture,
        outputDirectory,
        plan: {
          kind: 'remux',
          reason: 'container-incompatible',
          videoStreamIndex: 0,
          video: 'copy',
          audio: 'copy',
        },
        startTime: 1,
        segmentDuration: 1,
      })
      const executor = new FfmpegProcessExecutor()
      await executor.run({
        executable: ffmpeg,
        arguments: preset.arguments,
        inputs: preset.inputs,
        progress: true,
      })
      const firstTimestamp = await probeFirstOutputTimestamp({
        ffprobe,
        manifestPath: preset.output.manifestPath,
        executor,
      })
      expect(Number.isFinite(firstTimestamp)).toBe(true)
      const calibrated = calibrateGenerationTimeline({
        originalDuration: 7.966,
        originalStartTime: 5,
        requestedStartTime: 1,
        actualFirstOutputTimestamp: firstTimestamp,
      })
      expect(calibrated.timeline.calibrated).toBe(true)
      expect(calibrated.timeline.offset).toBeGreaterThanOrEqual(0)
    })
  },
)
