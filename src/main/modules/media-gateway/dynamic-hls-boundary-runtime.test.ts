import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { FfmpegProcessExecutor } from '../ffmpeg/executor'
import { compileDynamicHlsJob } from './dynamic-hls-job-compiler'
import { inspectSegmentMedia } from './segment-media-inspector'
import type { SegmentMediaRange } from './segment-media-inspector'
import { createKeyframeAlignedTimeline } from './hls-timeline'

const run = promisify(execFile)
const runtime = resolve('resources/ffmpeg', `${process.platform}-${process.arch}`)
const suffix = process.platform === 'win32' ? '.exe' : ''
const ffmpeg = join(runtime, `ffmpeg${suffix}`)
const ffprobe = join(runtime, `ffprobe${suffix}`)

interface ActualSegment {
  index: number
  duration: number
  ranges: SegmentMediaRange
}
const fixtures = [
  { name: 'irregular', keys: [0, 7, 12, 14, 18, 24, 30], origin: 0, vfr: false },
  { name: 'long-gop', keys: [0, 12, 24, 30], origin: 0, vfr: false },
  { name: 'nonzero', keys: [0, 7, 12, 14, 18, 24, 30], origin: 5, vfr: false },
  { name: 'vfr', keys: [0, 7, 12, 14, 18, 24, 30], origin: 0, vfr: true },
]

describe.runIf(existsSync(ffmpeg) && existsSync(ffprobe))('正式 HLS compiler 边界矩阵', () => {
  it.each(fixtures)(
    '$name：从开头、中间和最短尾段生成实际时间范围',
    async (fixture) => {
      const directory = await mkdtemp(join(tmpdir(), 'marchen-boundaries-'))
      try {
        const input = join(directory, 'input.mp4')
        await run(
          ffmpeg,
          [
            '-hide_banner',
            '-loglevel',
            'error',
            '-f',
            'lavfi',
            '-i',
            'testsrc2=size=160x90:rate=24:duration=32',
            '-f',
            'lavfi',
            '-i',
            'sine=sample_rate=48000:duration=32',
            ...(fixture.vfr
              ? ['-vf', "select='if(lt(t,10),not(mod(n,2)),1)'", '-fps_mode', 'vfr']
              : []),
            '-c:v',
            'libx264',
            '-preset',
            'veryfast',
            '-g',
            '9999',
            '-sc_threshold',
            '0',
            '-force_key_frames',
            fixture.keys.join(','),
            '-c:a',
            'aac',
            '-output_ts_offset',
            String(fixture.origin),
            '-y',
            input,
          ],
          { timeout: 15000 },
        )
        const frameResult = await run(ffprobe, [
          '-v',
          'error',
          '-select_streams',
          'v:0',
          '-skip_frame',
          'nokey',
          '-show_frames',
          '-show_entries',
          'frame=best_effort_timestamp_time',
          '-of',
          'json',
          input,
        ])
        const frames = (
          JSON.parse(frameResult.stdout) as {
            frames: Array<{ best_effort_timestamp_time: string }>
          }
        ).frames
        const measuredKeys = frames.map(
          (frame) => Number(frame.best_effort_timestamp_time) - fixture.origin,
        )
        expect(measuredKeys).toEqual(fixture.keys)
        const timeline = createKeyframeAlignedTimeline({
          sourceStartTime: fixture.origin,
          duration: 32,
          targetSegmentDuration: 6,
          keyframes: measuredKeys,
        })
        const jobs: Array<{
          index: number
          requestedStart: number
          seekOffsetSeconds: number
          actual: ActualSegment[]
        }> = []
        for (const index of [0, 1, timeline.segments.length - 1]) {
          const outputDirectory = join(directory, `job-${index}`)
          await mkdir(outputDirectory)
          const compiled = compileDynamicHlsJob({
            inputPath: input,
            outputDirectory,
            timeline,
            segmentIndex: index,
            seekOffsetSeconds: fixture.vfr || fixture.origin > 0 ? 0.5 : 0,
            pipeline: {
              kind: 'remux',
              plan: {
                kind: 'remux',
                reason: 'container-incompatible',
                videoStreamIndex: 0,
                audioStreamIndex: 1,
                video: 'copy',
                audio: 'copy',
              },
            },
          })
          await new FfmpegProcessExecutor().run({
            executable: ffmpeg,
            arguments: compiled.preset.arguments,
            inputs: compiled.preset.inputs,
            gracefulStdin: compiled.gracefulStdin,
            progress: true,
            timeoutMs: 15000,
          })
          const manifest = await readFile(compiled.preset.output.manifestPath, 'utf8')
          const names = manifest.split(/\r?\n/).filter((line) => /^segment-\d+\.m4s$/.test(line))
          const durations = [...manifest.matchAll(/#EXTINF:([\d.]+)/g)].map((match) =>
            Number(match[1]),
          )
          const actual: ActualSegment[] = []
          for (const [position, name] of names.entries()) {
            const ranges = await inspectSegmentMedia({
              ffprobe,
              executor: new FfmpegProcessExecutor(),
              initPath: compiled.preset.output.initPath,
              segmentPath: join(outputDirectory, name),
            })
            actual.push({
              index: Number(name.match(/\d+/)![0]),
              duration: durations[position]!,
              ranges,
            })
          }
          expect(actual.length).toBeGreaterThan(0)
          // 验证首片确实覆盖请求位置；不把后续 EXTINF 与计划完全一致作为假前提。
          expect(actual[0]!.index).toBe(index)
          expect(
            Math.abs(actual[0]!.ranges.video!.start - timeline.segments[index]!.startTime),
          ).toBeLessThan(0.15)
          expect(actual.at(-1)!.ranges.video!.end).toBeCloseTo(32, 1)
          for (const segment of actual) {
            expect(segment.ranges.audio!.end).toBeGreaterThan(segment.ranges.audio!.start)
            expect(segment.ranges.video!.end).toBeGreaterThan(segment.ranges.video!.start)
          }
          jobs.push({
            index,
            seekOffsetSeconds: fixture.vfr || fixture.origin > 0 ? 0.5 : 0,
            requestedStart: timeline.segments[index]!.startTime,
            actual,
          })
        }
        const evidenceDirectory = resolve('test-results/media-compat')
        await mkdir(evidenceDirectory, { recursive: true })
        const { stdout: version } = await run(ffmpeg, ['-version'])
        await writeFile(
          join(evidenceDirectory, `formal-boundary-${fixture.name}.json`),
          JSON.stringify(
            {
              scope: '正式 compiler 的合成输出；客户端可接受条件由 12.5 验证',
              ffmpeg: version.split('\n')[0],
              fixture,
              measuredKeys,
              timeline,
              jobs,
            },
            null,
            2,
          ) + '\n',
        )
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    },
    30000,
  )
})
