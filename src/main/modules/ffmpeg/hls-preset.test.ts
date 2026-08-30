import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'
import { validateHlsProducerOutput } from '../media-gateway/producer-validator'
import { FfmpegProcessExecutor } from './executor'
import {
  createH264EncoderInitializationArguments,
  createH264PipelinePreflightArguments,
  createRemuxHlsPreset,
  createTranscodeAudioHlsPreset,
  createTranscodeVideoHlsPreset,
  createVideoCompatibilityFilter,
  selectInitializedH264Encoder,
} from './hls-preset'

const temporaryDirectories: string[] = []
afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

const createDirectory = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'marchen-remux-hls-'))
  temporaryDirectories.push(directory)
  return directory
}

const plan = {
  kind: 'remux' as const,
  reason: 'container-incompatible' as const,
  videoStreamIndex: 3,
  audioStreamIndex: 7,
  video: 'copy' as const,
  audio: 'copy' as const,
}

describe('remux fMP4 HLS 预设', () => {
  it('特殊路径保持独立参数并显式 map/copy 音视频', async () => {
    const outputDirectory = await createDirectory()
    const preset = createRemuxHlsPreset({
      inputPath: '/媒体/含 空格;$(不执行).mkv',
      outputDirectory,
      plan,
      startTime: 30,
    })
    expect(preset.inputs).toEqual(['/媒体/含 空格;$(不执行).mkv'])
    expect(preset.arguments).toContain('0:3')
    expect(preset.arguments).toContain('0:7')
    expect(preset.arguments).toContain('copy')
    expect(preset.arguments).toContain('fmp4')
    expect(preset.arguments).toContain('independent_segments+temp_file')
    expect(preset.arguments.at(-1)).toBe(join(outputDirectory, 'index.m3u8'))
  })
})

describe('音频兼容 fMP4 HLS 预设', () => {
  it('视频 copy，音频固定 AAC-LC 48 kHz 并显式下混声道', async () => {
    const outputDirectory = await createDirectory()
    const preset = createTranscodeAudioHlsPreset({
      inputPath: '/media/eac3-5.1.mkv',
      outputDirectory,
      plan: {
        kind: 'transcode-audio',
        reason: 'audio-incompatible',
        videoStreamIndex: 2,
        audioStreamIndex: 5,
        video: 'copy',
        audio: { codec: 'aac', profile: 'aac_low', sampleRate: 48_000, channels: 2 },
      },
    })
    expect(preset.arguments).toEqual(
      expect.arrayContaining([
        '0:2',
        '0:5',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-profile:a',
        'aac_low',
        '-ar',
        '48000',
        '-ac',
        '2',
      ]),
    )
  })
})

describe('视频兼容 fMP4 HLS 预设', () => {
  it('真实初始化硬件编码器，失败后回退 libx264', async () => {
    const attempts: string[] = []
    await expect(
      selectInitializedH264Encoder(
        'win32',
        new Set(['h264_nvenc', 'h264_qsv', 'libx264']),
        async (encoder) => {
          attempts.push(encoder)
          if (encoder !== 'libx264') throw new Error(`${encoder} init failed`)
        },
      ),
    ).resolves.toBe('libx264')
    expect(attempts).toEqual(['h264_nvenc', 'h264_qsv', 'libx264'])
  })

  it('hDR 走 BT.709 SDR tone-map，90 度旋转时反转 SAR/DAR', () => {
    const filter = createVideoCompatibilityFilter(
      {
        kind: 'transcode-video',
        reason: 'video-incompatible',
        videoStreamIndex: 0,
        video: { codec: 'h264', toneMapToSdr: true },
        audio: 'copy',
      },
      {
        index: 0,
        type: 'video',
        codecName: 'hevc',
        width: 1920,
        height: 1080,
        bitDepth: 10,
        dynamicRange: 'hdr10',
        rotation: 90,
        sampleAspectRatio: '4:3',
        displayAspectRatio: '16:9',
        disposition: { default: true, forced: false, attachedPicture: false },
        tags: {},
      },
    )
    expect(filter).toContain('zscale=transfer=linear:npl=100')
    expect(filter).toContain('tonemap=tonemap=hable')
    expect(filter).toContain('zscale=primaries=bt709:transfer=bt709:matrix=bt709:range=tv')
    expect(filter).toContain('setsar=3/4')
    expect(filter).toContain('setdar=9/16')
  })

  it('hLG 允许进入 tone-map，色彩事实不足时拒绝猜测', () => {
    const toneMapPlan = {
      kind: 'transcode-video' as const,
      reason: 'video-incompatible' as const,
      videoStreamIndex: 0,
      video: { codec: 'h264' as const, toneMapToSdr: true },
      audio: 'copy' as const,
    }
    expect(
      createVideoCompatibilityFilter(toneMapPlan, {
        index: 0,
        type: 'video',
        codecName: 'hevc',
        width: 1920,
        height: 1080,
        dynamicRange: 'hlg',
        disposition: { default: true, forced: false, attachedPicture: false },
        tags: {},
      }),
    ).toContain('tonemap=tonemap=hable')
    expect(() =>
      createVideoCompatibilityFilter(toneMapPlan, {
        index: 0,
        type: 'video',
        codecName: 'hevc',
        width: 1920,
        height: 1080,
        dynamicRange: 'unknown',
        disposition: { default: true, forced: false, attachedPicture: false },
        tags: {},
      }),
    ).toThrow('需要明确的 HDR10 或 HLG 色彩事实')
  })

  it('编码器自检只使用合成帧，真实 pipeline 预检与正式预设使用全局 stream index', async () => {
    const outputDirectory = await createDirectory()
    const init = createH264EncoderInitializationArguments({
      encoder: 'h264_videotoolbox',
    })
    const pipelinePreflight = createH264PipelinePreflightArguments({
      inputPath: '/video/hevc.mkv',
      encoder: 'libx264',
      plan: {
        kind: 'transcode-video',
        reason: 'video-incompatible',
        videoStreamIndex: 4,
        audioStreamIndex: 6,
        video: { codec: 'h264', toneMapToSdr: false },
        audio: { codec: 'aac', profile: 'aac_low', sampleRate: 48_000, channels: 2 },
      },
    })
    const preset = createTranscodeVideoHlsPreset({
      inputPath: '/video/hevc.mkv',
      outputDirectory,
      encoder: 'libx264',
      plan: {
        kind: 'transcode-video',
        reason: 'video-incompatible',
        videoStreamIndex: 4,
        audioStreamIndex: 6,
        video: { codec: 'h264', toneMapToSdr: false },
        audio: 'copy',
      },
    })
    expect(init).toEqual(
      expect.arrayContaining(['-f', 'lavfi', '-i', 'color=c=black:size=64x64:rate=1:duration=1']),
    )
    expect(init).not.toContain('/video/hevc.mkv')
    expect(init).not.toContain('-map')
    expect(init).not.toContain('-progress')
    expect(init).not.toContain('pipe:3')
    expect(pipelinePreflight).toEqual(
      expect.arrayContaining([
        '/video/hevc.mkv',
        '0:4',
        '0:6',
        '-c:v',
        'libx264',
        '-c:a',
        'aac',
        '-f',
        'mp4',
        '-movflags',
        'frag_keyframe+empty_moov',
        'pipe:1',
      ]),
    )
    expect(pipelinePreflight).not.toContain('-progress')
    expect(pipelinePreflight).not.toContain('pipe:3')
    expect(preset.arguments).toEqual(
      expect.arrayContaining(['0:4', '0:6', '-c:v', 'libx264', '-c:a', 'copy']),
    )
    expect(preset.arguments).toEqual(
      expect.arrayContaining(['-pix_fmt', 'yuv420p', '-flags', '+cgop', '-sc_threshold', '0']),
    )
  })

  it('10-bit SDR 只降到 yuv420p 并保留源色彩元数据，不添加 tone-map', async () => {
    const outputDirectory = await createDirectory()
    const preset = createTranscodeVideoHlsPreset({
      inputPath: '/video/main10-sdr.mkv',
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
        codecName: 'hevc',
        width: 1920,
        height: 1080,
        bitDepth: 10,
        dynamicRange: 'sdr',
        colorPrimaries: 'bt709',
        colorTransfer: 'bt709',
        colorSpace: 'bt709',
        colorRange: 'tv',
        disposition: { default: true, forced: false, attachedPicture: false },
        tags: {},
      },
    })
    expect(preset.arguments).not.toContain('-vf')
    expect(preset.arguments).toEqual(
      expect.arrayContaining([
        '-pix_fmt',
        'yuv420p',
        '-color_primaries',
        'bt709',
        '-color_trc',
        'bt709',
        '-colorspace',
        'bt709',
        '-color_range',
        'tv',
      ]),
    )
  })
})

const runtimeDirectory = resolve('resources', 'ffmpeg', `${process.platform}-${process.arch}`)
const executableSuffix = process.platform === 'win32' ? '.exe' : ''
const ffmpeg = join(runtimeDirectory, `ffmpeg${executableSuffix}`)
const fixture = resolve('test-results/media-compat/native-h264-aac.mp4')
const eac3Fixture = resolve('test-results/media-compat/h264-eac3-5.1.mkv')
const hevcFixture = resolve('test-results/media-compat/hevc-main8-aac.mp4')
const hevcEac3Fixture = resolve('test-results/media-compat/hevc-main10-eac3-5.1.mkv')
const hdrFixture = resolve('test-results/media-compat/hevc-main10-hdr-aac.mkv')
const structureSdrFixture = resolve(
  'test-results/media-compat/structure-main10-sdr-flac-long-gop.mkv',
)
const structureHlgFixture = resolve('test-results/media-compat/structure-hlg-long-gop.mkv')
const ffprobe = join(runtimeDirectory, `ffprobe${executableSuffix}`)

describe.runIf(existsSync(ffmpeg) && existsSync(fixture))('真实 FFmpeg remux fMP4 HLS', () => {
  it('输出 event manifest、init.mp4 与完整 m4s，且不遗留 tmp', async () => {
    const outputDirectory = await createDirectory()
    const preset = createRemuxHlsPreset({
      inputPath: fixture,
      outputDirectory,
      plan: { ...plan, videoStreamIndex: 0, audioStreamIndex: 1 },
      segmentDuration: 1,
    })
    await new FfmpegProcessExecutor().run({
      executable: ffmpeg,
      arguments: preset.arguments,
      inputs: preset.inputs,
      progress: true,
    })

    const manifest = await readFile(preset.output.manifestPath, 'utf8')
    const files = await readdir(outputDirectory)
    expect(manifest).toContain('#EXT-X-PLAYLIST-TYPE:EVENT')
    expect(manifest).toContain('#EXT-X-MAP:URI="init.mp4"')
    expect(files).toContain('init.mp4')
    expect(files.some((name) => name.endsWith('.m4s'))).toBe(true)
    expect(files.some((name) => name.endsWith('.tmp'))).toBe(false)
  })
})

describe.runIf(existsSync(ffmpeg) && existsSync(ffprobe) && existsSync(eac3Fixture))(
  '真实 FFmpeg 音频兼容 HLS',
  () => {
    it('eAC-3 5.1 仅转为双声道 AAC，视频仍为 H.264', async () => {
      const outputDirectory = await createDirectory()
      const preset = createTranscodeAudioHlsPreset({
        inputPath: eac3Fixture,
        outputDirectory,
        plan: {
          kind: 'transcode-audio',
          reason: 'audio-incompatible',
          videoStreamIndex: 0,
          audioStreamIndex: 1,
          video: 'copy',
          audio: { codec: 'aac', profile: 'aac_low', sampleRate: 48_000, channels: 2 },
        },
        segmentDuration: 1,
      })
      const executor = new FfmpegProcessExecutor()
      await executor.run({
        executable: ffmpeg,
        arguments: preset.arguments,
        inputs: preset.inputs,
        progress: true,
      })
      const inspected = await executor.run({
        executable: ffprobe,
        arguments: ['-v', 'error', '-show_streams', '-of', 'json', preset.output.initPath],
        inputs: [preset.output.initPath],
        kind: 'probe',
      })
      const streams = JSON.parse(inspected.stdout.toString('utf8')).streams as Array<{
        codec_name: string
        codec_type: string
        channels?: number
        sample_rate?: string
      }>
      expect(streams.find((stream) => stream.codec_type === 'video')?.codec_name).toBe('h264')
      expect(streams.find((stream) => stream.codec_type === 'audio')).toMatchObject({
        codec_name: 'aac',
        channels: 2,
        sample_rate: '48000',
      })
    })
  },
)

describe.runIf(existsSync(ffmpeg) && existsSync(ffprobe) && existsSync(hevcEac3Fixture))(
  '真实 FFmpeg HEVC 音频兼容 HLS',
  () => {
    it('复制 HEVC 到 fMP4 时使用 Chromium 可接受的 hvc1 sample entry', async () => {
      const outputDirectory = await createDirectory()
      const sourceVideo = {
        index: 0,
        type: 'video' as const,
        codecName: 'hevc',
        width: 1920,
        height: 1080,
        dynamicRange: 'hdr10' as const,
        bitDepth: 10,
        disposition: { default: true, forced: false, attachedPicture: false },
        tags: {},
      }
      const preset = createTranscodeAudioHlsPreset({
        inputPath: hevcEac3Fixture,
        outputDirectory,
        sourceVideo,
        plan: {
          kind: 'transcode-audio',
          reason: 'audio-incompatible',
          videoStreamIndex: 0,
          audioStreamIndex: 1,
          video: 'copy',
          audio: { codec: 'aac', profile: 'aac_low', sampleRate: 48_000, channels: 2 },
        },
        segmentDuration: 1,
      })
      const executor = new FfmpegProcessExecutor()
      await executor.run({
        executable: ffmpeg,
        arguments: preset.arguments,
        inputs: preset.inputs,
        progress: true,
      })
      const inspected = await executor.run({
        executable: ffprobe,
        arguments: [
          '-v',
          'error',
          '-show_entries',
          'stream=codec_name,codec_tag_string,profile,pix_fmt',
          '-of',
          'json',
          preset.output.initPath,
        ],
        inputs: [preset.output.initPath],
        kind: 'probe',
      })
      const streams = JSON.parse(inspected.stdout.toString('utf8')).streams as Array<{
        codec_name: string
        codec_tag_string: string
        profile?: string
        pix_fmt?: string
      }>
      expect(streams.find((stream) => stream.codec_name === 'hevc')).toMatchObject({
        codec_tag_string: 'hvc1',
        profile: 'Main 10',
        pix_fmt: 'yuv420p10le',
      })
    })
  },
)

describe.runIf(existsSync(ffmpeg) && existsSync(ffprobe) && existsSync(hdrFixture))(
  '真实 FFmpeg HDR tone-map HLS',
  () => {
    it('main10 HDR 输出 8-bit BT.709 H.264 SDR', async () => {
      const outputDirectory = await createDirectory()
      const plan = {
        kind: 'transcode-video' as const,
        reason: 'video-incompatible' as const,
        videoStreamIndex: 0,
        audioStreamIndex: 1,
        video: { codec: 'h264' as const, toneMapToSdr: true },
        audio: 'copy' as const,
      }
      const preset = createTranscodeVideoHlsPreset({
        inputPath: hdrFixture,
        outputDirectory,
        encoder: 'libx264',
        plan,
        sourceVideo: {
          index: 0,
          type: 'video',
          codecName: 'hevc',
          width: 320,
          height: 180,
          bitDepth: 10,
          dynamicRange: 'hdr10',
          colorPrimaries: 'bt2020',
          colorTransfer: 'smpte2084',
          colorSpace: 'bt2020nc',
          disposition: { default: true, forced: false, attachedPicture: false },
          tags: {},
        },
        segmentDuration: 1,
      })
      const executor = new FfmpegProcessExecutor()
      await executor.run({
        executable: ffmpeg,
        arguments: preset.arguments,
        inputs: preset.inputs,
        progress: true,
      })
      const inspected = await executor.run({
        executable: ffprobe,
        arguments: ['-v', 'error', '-show_streams', '-of', 'json', preset.output.manifestPath],
        inputs: [preset.output.manifestPath],
        kind: 'probe',
      })
      const video = (
        JSON.parse(inspected.stdout.toString('utf8')).streams as Array<Record<string, unknown>>
      ).find((stream) => stream.codec_type === 'video')
      expect(video).toMatchObject({
        codec_name: 'h264',
        pix_fmt: 'yuv420p',
        color_space: 'bt709',
        color_transfer: 'bt709',
        color_primaries: 'bt709',
      })
    })
  },
)

describe.runIf(existsSync(ffmpeg) && existsSync(ffprobe) && existsSync(hevcFixture))(
  '真实 FFmpeg HEVC 视频兼容 HLS',
  () => {
    it('libx264 输出 H.264，并保持兼容 AAC 音频', async () => {
      const outputDirectory = await createDirectory()
      const preset = createTranscodeVideoHlsPreset({
        inputPath: hevcFixture,
        outputDirectory,
        encoder: 'libx264',
        plan: {
          kind: 'transcode-video',
          reason: 'video-incompatible',
          videoStreamIndex: 0,
          audioStreamIndex: 1,
          video: { codec: 'h264', toneMapToSdr: false },
          audio: 'copy',
        },
        segmentDuration: 1,
      })
      const executor = new FfmpegProcessExecutor()
      await executor.run({
        executable: ffmpeg,
        arguments: preset.arguments,
        inputs: preset.inputs,
        progress: true,
      })
      await validateHlsProducerOutput({
        ffprobe,
        executor,
        manifestPath: preset.output.manifestPath,
        initPath: preset.output.initPath,
        firstSegmentPath: join(outputDirectory, 'segment-00000.m4s'),
        profile: {
          kind: 'safe-h264-aac-sdr',
          reason: 'video-incompatible',
          videoStreamIndex: 0,
          audioStreamIndex: 1,
          video: { codec: 'h264', pixelFormat: 'yuv420p', toneMapToSdr: false },
        },
      })
      const inspected = await executor.run({
        executable: ffprobe,
        arguments: ['-v', 'error', '-show_streams', '-of', 'json', preset.output.initPath],
        inputs: [preset.output.initPath],
        kind: 'probe',
      })
      const streams = JSON.parse(inspected.stdout.toString('utf8')).streams as Array<{
        codec_name: string
        codec_type: string
      }>
      expect(streams.find((stream) => stream.codec_type === 'video')?.codec_name).toBe('h264')
      expect(streams.find((stream) => stream.codec_type === 'audio')?.codec_name).toBe('aac')
    })
  },
)

describe.runIf(existsSync(ffmpeg) && existsSync(ffprobe) && existsSync(structureSdrFixture))(
  '30 秒 Main10 SDR + FLAC 安全档位',
  () => {
    it('不添加 tone-map，输出 H.264 yuv420p + AAC 并通过首段验证', async () => {
      const outputDirectory = await createDirectory()
      const profile = {
        kind: 'safe-h264-aac-sdr' as const,
        reason: 'video-incompatible' as const,
        videoStreamIndex: 0,
        audioStreamIndex: 1,
        video: {
          codec: 'h264' as const,
          pixelFormat: 'yuv420p' as const,
          toneMapToSdr: false as const,
        },
        audio: {
          codec: 'aac' as const,
          profile: 'aac_low' as const,
          sampleRate: 48_000 as const,
          channels: 1 as const,
        },
      }
      const preset = createTranscodeVideoHlsPreset({
        inputPath: structureSdrFixture,
        outputDirectory,
        encoder: 'libx264',
        plan: {
          kind: 'transcode-video',
          reason: 'video-incompatible',
          videoStreamIndex: 0,
          audioStreamIndex: 1,
          video: { codec: 'h264', toneMapToSdr: false },
          audio: profile.audio,
        },
        sourceVideo: {
          index: 0,
          type: 'video',
          codecName: 'hevc',
          width: 320,
          height: 180,
          bitDepth: 10,
          dynamicRange: 'unknown',
          disposition: { default: true, forced: false, attachedPicture: false },
          tags: {},
        },
        segmentDuration: 1,
      })
      expect(preset.arguments).not.toContain('-vf')
      const executor = new FfmpegProcessExecutor()
      await executor.run({
        executable: ffmpeg,
        arguments: preset.arguments,
        inputs: preset.inputs,
        progress: true,
      })
      await validateHlsProducerOutput({
        ffprobe,
        executor,
        manifestPath: preset.output.manifestPath,
        initPath: preset.output.initPath,
        firstSegmentPath: join(outputDirectory, 'segment-00000.m4s'),
        profile,
      })
    })
  },
)

describe.runIf(existsSync(ffmpeg) && existsSync(ffprobe) && existsSync(structureHlgFixture))(
  '30 秒 HLG 长 GOP tone-map',
  () => {
    it('hLG 只在 HDR 档位转换为 BT.709 H.264 SDR', async () => {
      const outputDirectory = await createDirectory()
      const preset = createTranscodeVideoHlsPreset({
        inputPath: structureHlgFixture,
        outputDirectory,
        encoder: 'libx264',
        plan: {
          kind: 'transcode-video',
          reason: 'video-incompatible',
          videoStreamIndex: 0,
          audioStreamIndex: 1,
          video: { codec: 'h264', toneMapToSdr: true },
          audio: { codec: 'aac', profile: 'aac_low', sampleRate: 48_000, channels: 1 },
        },
        sourceVideo: {
          index: 0,
          type: 'video',
          codecName: 'hevc',
          width: 320,
          height: 180,
          bitDepth: 10,
          dynamicRange: 'hlg',
          colorPrimaries: 'bt2020',
          colorTransfer: 'arib-std-b67',
          colorSpace: 'bt2020nc',
          colorRange: 'tv',
          disposition: { default: true, forced: false, attachedPicture: false },
          tags: {},
        },
        segmentDuration: 1,
      })
      const executor = new FfmpegProcessExecutor()
      await executor.run({
        executable: ffmpeg,
        arguments: preset.arguments,
        inputs: preset.inputs,
        progress: true,
      })
      const inspected = await executor.run({
        executable: ffprobe,
        arguments: ['-v', 'error', '-show_streams', '-of', 'json', preset.output.manifestPath],
        inputs: [preset.output.manifestPath],
        kind: 'probe',
      })
      const video = (
        JSON.parse(inspected.stdout.toString('utf8')).streams as Array<Record<string, unknown>>
      ).find((stream) => stream.codec_type === 'video')
      expect(video).toMatchObject({
        codec_name: 'h264',
        pix_fmt: 'yuv420p',
        color_space: 'bt709',
        color_transfer: 'bt709',
        color_primaries: 'bt709',
      })
    })
  },
)
