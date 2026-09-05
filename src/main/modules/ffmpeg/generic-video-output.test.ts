import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FfmpegProcessExecutor } from './executor'
import { createTranscodeVideoHlsPreset } from './hls-preset'

const runtimeDirectory = resolve('resources', 'ffmpeg', `${process.platform}-${process.arch}`)
const suffix = process.platform === 'win32' ? '.exe' : ''
const ffmpeg = join(runtimeDirectory, `ffmpeg${suffix}`)
const ffprobe = join(runtimeDirectory, `ffprobe${suffix}`)
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

const verifyH264Output = async (inputPath: string, codecName: string) => {
  const outputDirectory = await mkdtemp(join(tmpdir(), 'marchen-generic-video-'))
  temporaryDirectories.push(outputDirectory)
  const preset = createTranscodeVideoHlsPreset({
    inputPath,
    outputDirectory,
    encoder: 'libx264',
    plan: {
      kind: 'transcode-video',
      reason: 'video-incompatible',
      videoStreamIndex: 0,
      video: { codec: 'h264', toneMapToSdr: false },
      audio: 'copy',
    },
    sourceVideo: {
      index: 0,
      type: 'video',
      codecName,
      width: 320,
      height: 180,
      dynamicRange: 'sdr',
      disposition: { default: true, forced: false, attachedPicture: false },
      tags: {},
    },
  })
  const executor = new FfmpegProcessExecutor()
  await executor.run({
    executable: ffmpeg,
    arguments: preset.arguments,
    inputs: preset.inputs,
    progress: true,
    timeoutMs: 30_000,
  })
  const inspected = await executor.run({
    executable: ffprobe,
    arguments: [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=codec_name,pix_fmt',
      '-of',
      'json',
      preset.output.manifestPath,
    ],
    inputs: [preset.output.manifestPath],
    kind: 'probe',
  })
  const stream = (
    JSON.parse(inspected.stdout.toString('utf8')) as { streams?: Array<Record<string, string>> }
  ).streams?.[0]
  expect(stream).toMatchObject({ codec_name: 'h264', pix_fmt: 'yuv420p' })
}

const generatedCases = [
  ['av1', resolve('test-results/media-compat/av1-video.mkv')],
  ['vp9', resolve('test-results/media-compat/vp9-video.webm')],
  ['mpeg2video', resolve('test-results/media-compat/mpeg2-video.mkv')],
] as const

describe.runIf(
  existsSync(ffmpeg) && existsSync(ffprobe) && generatedCases.every(([, path]) => existsSync(path)),
)('通用视频输入真实 H.264 输出', () => {
  it.each(generatedCases)('%s → H.264 yuv420p fMP4 HLS', async (codecName, path) => {
    await verifyH264Output(path, codecName)
  })
})

const vc1Fixture = process.env.MARCHEN_SMOKE_VC1
describe.runIf(Boolean(vc1Fixture && existsSync(vc1Fixture)))('本地 VC-1 真实 H.264 输出', () => {
  it('VC-1 → H.264 yuv420p fMP4 HLS', async () => {
    await verifyH264Output(resolve(vc1Fixture!), 'vc1')
  })
})
