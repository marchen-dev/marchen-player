import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FfmpegProcessExecutor } from '../ffmpeg/executor'
import { extractMatroskaKeyframes } from '../ffmpeg/matroska-keyframes'
import { createKeyframeAlignedTimeline } from './hls-timeline'
import { compileDynamicHlsJob } from './dynamic-hls-job-compiler'
import { inspectSegmentMedia } from './segment-media-inspector'

const fixture = resolve('test-results/media-compat/formal-app-hevc-eac3-timeline.mkv')
const ffmpeg = resolve('resources/ffmpeg', `${process.platform}-${process.arch}`, 'ffmpeg')
const ffprobe = join(ffmpeg, '..', 'ffprobe')

describe.runIf(existsSync(fixture) && existsSync(ffmpeg))(
  'HEVC 重启边界诊断（非播放通过判定）',
  () => {
    it('保存正式 compiler 在 96 秒切点的原始音视频范围', async () => {
      const root = await mkdtemp(join(tmpdir(), 'marchen-hevc-restart-'))
      try {
        const keys = await extractMatroskaKeyframes(fixture)
        const timeline = createKeyframeAlignedTimeline({ ...keys, targetSegmentDuration: 6 })
        const executor = new FfmpegProcessExecutor()
        const cases: Array<{
          seekOffsetSeconds: number
          audioPreroll: boolean
          planned: (typeof timeline.segments)[number]
          actual: Awaited<ReturnType<typeof inspectSegmentMedia>>
        }> = []
        for (const { seekOffsetSeconds, audioPreroll, segmentIndex } of [
          { seekOffsetSeconds: 0, audioPreroll: false, segmentIndex: 16 },
          { seekOffsetSeconds: 0.5, audioPreroll: false, segmentIndex: 16 },
          ...[1, 16, 19].map((segmentIndex) => ({
            seekOffsetSeconds: 0.5,
            audioPreroll: true,
            segmentIndex,
          })),
        ]) {
          const directory = join(
            root,
            `offset-${seekOffsetSeconds}-${audioPreroll}-${segmentIndex}`,
          )
          await mkdir(directory)
          const compiled = compileDynamicHlsJob({
            inputPath: fixture,
            outputDirectory: directory,
            timeline,
            segmentIndex,
            seekOffsetSeconds,
            audioPreroll,
            sourceVideo: {
              type: 'video',
              index: 0,
              codecName: 'hevc',
              width: 320,
              height: 180,
              dynamicRange: 'sdr',
              disposition: { default: true, forced: false, attachedPicture: false },
              tags: {},
            },
            pipeline: {
              kind: 'audio-compatible',
              plan: {
                kind: 'transcode-audio',
                reason: 'audio-incompatible',
                videoStreamIndex: 0,
                audioStreamIndex: 1,
                video: 'copy',
                audio: { codec: 'aac', profile: 'aac_low', channels: 2, sampleRate: 48000 },
              },
            },
            audioEncoder: 'aac',
          })
          await executor
            .run({
              executable: ffmpeg,
              arguments: compiled.preset.arguments,
              inputs: compiled.preset.inputs,
              gracefulStdin: true,
              progress: true,
            })
            .catch((error) => {
              throw new Error(error.stderr, { cause: error })
            })
          const actual = await inspectSegmentMedia({
            ffprobe,
            executor,
            initPath: compiled.preset.output.initPath,
            segmentPath: join(directory, compiled.expectedSegmentName),
          })
          cases.push({
            seekOffsetSeconds,
            audioPreroll,
            planned: timeline.segments[segmentIndex],
            actual,
          })
        }
        await writeFile(
          resolve('test-results/media-compat/formal-hevc-preroll-boundary.json'),
          JSON.stringify(
            {
              fixture: 'formal-app-hevc-eac3-timeline.mkv',
              scope: 'output-diagnostic-only',
              cases,
            },
            null,
            2,
          ),
        )
        expect(cases).toHaveLength(5)
        expect(cases.every((entry) => entry.actual.video.end > entry.actual.video.start)).toBe(true)
        for (const entry of cases.filter((entry) => entry.audioPreroll)) {
          expect(Math.abs(entry.actual.video.start - entry.planned.startTime)).toBeLessThan(0.15)
          expect(Math.abs(entry.actual.video.end - entry.planned.endTime)).toBeLessThan(0.15)
          expect(entry.actual.audio).toBeDefined()
          expect(Math.abs(entry.actual.audio!.start - entry.actual.video.start)).toBeLessThan(0.15)
          expect(Math.abs(entry.actual.audio!.end - entry.actual.video.end)).toBeLessThan(0.15)
        }
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    }, 15000)
  },
)
