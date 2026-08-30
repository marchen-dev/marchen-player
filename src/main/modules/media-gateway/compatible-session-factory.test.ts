import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { MediaCacheManager } from '../ffmpeg/cache'
import { FfmpegExecutionError, FfmpegProcessExecutor  } from '../ffmpeg/executor'
import { FfmpegMediaTools } from '../ffmpeg/media-tools'
import { FfmpegTaskScheduler } from '../ffmpeg/scheduler'
import { createCompatibleSessionFactory } from './compatible-session-factory'
import { MediaGatewayRegistry } from './registry'

const safeRequest = {
  requestId: 'safe-request',
  source: {
    kind: 'electron-file' as const,
    path: '/media/input.mkv',
    hash: 'fixture-hash',
    name: 'input.mkv',
    size: 1,
  },
  plan: {
    kind: 'safe-h264-aac-sdr' as const,
    reason: 'video-incompatible' as const,
    videoStreamIndex: 0,
    video: {
      codec: 'h264' as const,
      pixelFormat: 'yuv420p' as const,
      toneMapToSdr: false as const,
    },
  },
  startTime: 0,
}

const fakeProbe = {
  sourceId: 'fixture-hash',
  container: 'matroska',
  duration: 30,
  startTime: 0,
  streams: [
    {
      index: 0,
      type: 'video' as const,
      codecName: 'hevc',
      width: 320,
      height: 180,
      dynamicRange: 'sdr' as const,
      disposition: { default: true, forced: false, attachedPicture: false },
      tags: {},
    },
  ],
  selectedVideoStreamIndex: 0,
}

const fakeBackend = (run: ReturnType<typeof vi.fn>) => ({
  runtime: {
    paths: { ffmpeg: '/runtime/ffmpeg', ffprobe: '/runtime/ffprobe' },
    capabilities: { encoders: new Set(['libx264']) },
  },
  executor: { run },
  scheduler: {
    schedule: ({ run: task }: { run: (signal: AbortSignal) => Promise<unknown> }) =>
      task(new AbortController().signal),
  },
})

describe('兼容会话工厂分阶段预检错误', () => {
  it('编码器合成帧自检失败保留 encoder-check 与 stderr', async () => {
    const run = vi.fn().mockRejectedValue(
      new FfmpegExecutionError('encoder init failed', {
        failure: 'exit',
        code: 1,
        stderr: 'VideoToolbox unavailable',
        durationMs: 1,
      }),
    )
    const registry = new MediaGatewayRegistry()
    const registration = registry.createSession('fixture-hash')
    const factory = createCompatibleSessionFactory(registry, {
      getBackend: async () => fakeBackend(run) as never,
      probe: async () => fakeProbe as never,
      platform: 'linux',
    })
    await expect(
      factory({ registration, request: safeRequest, gatewayUrl: 'http://127.0.0.1:1' }),
    ).rejects.toMatchObject({
      detail: {
        code: 'encoder-check-failed',
        stage: 'encoder-check',
        exitCode: 1,
        stderrTail: 'VideoToolbox unavailable',
      },
    })
  })

  it('真实文件预检失败与色彩滤镜失败都标记 pipeline-preflight', async () => {
    const registry = new MediaGatewayRegistry()
    const registration = registry.createSession('fixture-hash')
    const run = vi
      .fn()
      .mockResolvedValueOnce({ stdout: Buffer.alloc(0) })
      .mockRejectedValueOnce(
        new FfmpegExecutionError('stream map failed', {
          failure: 'exit',
          code: 2,
          stderr: 'Stream map 0:9 matches no streams',
          durationMs: 1,
        }),
      )
    const factory = createCompatibleSessionFactory(registry, {
      getBackend: async () => fakeBackend(run) as never,
      probe: async () => fakeProbe as never,
      platform: 'linux',
    })
    await expect(
      factory({ registration, request: safeRequest, gatewayUrl: 'http://127.0.0.1:1' }),
    ).rejects.toMatchObject({
      detail: {
        code: 'pipeline-preflight-failed',
        stage: 'pipeline-preflight',
        exitCode: 2,
        stderrTail: 'Stream map 0:9 matches no streams',
      },
    })

    const filterRegistration = registry.createSession('fixture-hash-filter')
    const filterRun = vi.fn().mockResolvedValue({ stdout: Buffer.alloc(0) })
    const filterFactory = createCompatibleSessionFactory(registry, {
      getBackend: async () => fakeBackend(filterRun) as never,
      probe: async () => fakeProbe as never,
      platform: 'linux',
    })
    await expect(
      filterFactory({
        registration: filterRegistration,
        gatewayUrl: 'http://127.0.0.1:1',
        request: {
          ...safeRequest,
          requestId: 'hdr-filter-failure',
          plan: {
            kind: 'hdr-to-sdr-h264-aac',
            reason: 'video-incompatible',
            videoStreamIndex: 0,
            video: { codec: 'h264', pixelFormat: 'yuv420p', toneMapToSdr: true },
          },
        },
      }),
    ).rejects.toMatchObject({
      detail: {
        code: 'pipeline-preflight-failed',
        stage: 'pipeline-preflight',
        cause: expect.stringContaining('需要明确的 HDR10 或 HLG'),
      },
    })
  })
})

const runtimeDirectory = resolve('resources', 'ffmpeg', `${process.platform}-${process.arch}`)
const suffix = process.platform === 'win32' ? '.exe' : ''
const ffmpeg = join(runtimeDirectory, `ffmpeg${suffix}`)
const ffprobe = join(runtimeDirectory, `ffprobe${suffix}`)
const fixture = resolve('test-results/media-compat/native-h264-aac.mp4')
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

describe.runIf(existsSync(ffmpeg) && existsSync(ffprobe) && existsSync(fixture))(
  '真实兼容播放会话工厂',
  () => {
    it('从 durable source 生成并原子发布可播放 HLS lease', async () => {
      const cacheRoot = await mkdtemp(join(tmpdir(), 'marchen-compatible-factory-'))
      temporaryDirectories.push(cacheRoot)
      const registry = new MediaGatewayRegistry()
      const registration = registry.createSession('fixture-hash')
      const executor = new FfmpegProcessExecutor()
      const scheduler = new FfmpegTaskScheduler()
      const mediaTools = new FfmpegMediaTools(
        { ffmpeg, ffprobe },
        { screenshots: join(cacheRoot, 'screenshots'), subtitles: join(cacheRoot, 'subtitles') },
        executor,
        scheduler,
      )
      const factory = createCompatibleSessionFactory(registry, {
        getBackend: async () => ({
          runtime: {
            paths: {
              directory: runtimeDirectory,
              ffmpeg,
              ffprobe,
              metadata: join(runtimeDirectory, 'runtime-metadata.json'),
              target: `${process.platform}-${process.arch}`,
            },
            metadata: {} as never,
            capabilities: {
              decoders: new Set(),
              encoders: new Set(['libx264']),
              formats: new Set(),
              filters: new Set(),
              protocols: new Set(),
            },
          },
          executor,
          scheduler,
          cacheManager: new MediaCacheManager({ root: cacheRoot }),
        }),
        probe: (sourcePath, sourceId) => mediaTools.probe(sourcePath, sourceId),
        platform: process.platform,
      })
      const compatible = await factory({
        registration,
        gatewayUrl: 'http://127.0.0.1:12345',
        request: {
          requestId: 'fixture-request',
          source: {
            kind: 'electron-file',
            path: fixture,
            hash: 'fixture-hash',
            name: 'native-h264-aac.mp4',
            size: 1,
          },
          plan: {
            kind: 'copy-video-aac',
            reason: 'container-incompatible',
            videoStreamIndex: 0,
            audioStreamIndex: 1,
            video: 'copy',
            audio: {
              codec: 'aac',
              profile: 'aac_low',
              sampleRate: 48_000,
              channels: 2,
            },
            startupDeadlineMs: 8_000,
          },
          startTime: 0,
        },
      })

      await compatible.start()
      await vi.waitFor(
        () => expect(compatible.session).toMatchObject({ status: 'ready', activeGeneration: 0 }),
        { timeout: 10_000 },
      )
      expect(compatible.session?.lease).toMatchObject({
        logicalSourceId: 'fixture-hash',
        profile: 'copy-video-aac',
        attemptChain: ['copy-video-aac'],
        transport: 'hls',
        mimeType: 'application/vnd.apple.mpegurl',
        generation: 0,
      })
      expect(registry.resolve(registration.token, 0, 'index.m3u8')).toBeDefined()

      await compatible.seek(0, 1)
      await vi.waitFor(
        () => expect(compatible.session).toMatchObject({ status: 'ready', activeGeneration: 1 }),
        { timeout: 10_000 },
      )
      expect(compatible.session?.lease).toMatchObject({
        generation: 1,
        timeline: { originalDuration: expect.any(Number), offset: expect.any(Number) },
      })
      expect(registry.resolve(registration.token, 1, 'index.m3u8')).toBeDefined()
      await compatible.release()
      scheduler.close()
    })
  },
)
