import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { FfmpegProcessExecutor } from '../ffmpeg/executor'
import { FfmpegTaskScheduler } from '../ffmpeg/scheduler'
import { MediaCacheManager } from '../ffmpeg/cache'
import { createDynamicHlsCompatibleSession } from './dynamic-hls-compatible-session'
import { DynamicHlsRequestCoordinator } from './dynamic-hls-coordinator'
import { MediaGatewayRegistry } from './registry'
import { MediaGatewayRouter } from './router'
import { MediaGatewayServer } from './server'
import { MediaSessionController } from './session-controller'
import { createClosedGopTimeline } from './hls-timeline'
import type { FfmpegRuntime } from '../ffmpeg/runtime'

const ffmpeg = resolve(
  'resources/ffmpeg',
  `${process.platform}-${process.arch}`,
  process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg',
)
const ffprobe = join(ffmpeg, '..', process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe')
const run = promisify(execFile)

describe.runIf(existsSync(ffmpeg))('应用兼容会话工厂的真实 v2 输出', () => {
  it('正式 controller → factory → coordinator/router 生成稳定租约并清理任务', async () => {
    const root = await mkdtemp(join(tmpdir(), 'marchen-formal-session-'))
    const registry = new MediaGatewayRegistry()
    const coordinator = new DynamicHlsRequestCoordinator()
    const gateway = new MediaGatewayServer(
      new MediaGatewayRouter(registry, {
        isOriginAllowed: () => true,
        dynamicHlsV2Enabled: true,
        dynamicHlsCoordinator: coordinator,
      }).handle,
    )
    const scheduler = new FfmpegTaskScheduler()
    const backend = {
      executor: new FfmpegProcessExecutor(),
      scheduler,
      cacheManager: new MediaCacheManager({ root: join(root, 'cache') }),
      runtime: { paths: { ffmpeg, ffprobe } } as FfmpegRuntime,
    }
    const controller = new MediaSessionController(
      registry,
      () => gateway.url,
      (input) =>
        createDynamicHlsCompatibleSession({
          ...input,
          backend,
          registry,
          coordinator,
          sourceVideo: {
            type: 'video',
            index: 0,
            codecName: 'h264',
            width: 160,
            height: 90,
            dynamicRange: 'sdr',
            disposition: { default: true, forced: false, attachedPicture: false },
            tags: {},
          },
          timeline: createClosedGopTimeline({
            sourceStartTime: 0,
            duration: 18,
            targetSegmentDuration: 6,
          }),
          pipeline: {
            kind: 'audio-compatible',
            plan: {
              kind: 'transcode-audio',
              reason: 'audio-incompatible',
              videoStreamIndex: 0,
              audioStreamIndex: 1,
              video: 'copy',
              audio: { codec: 'aac', profile: 'aac_low', sampleRate: 48000, channels: 2 },
            },
          },
        }),
    )
    try {
      const input = join(root, 'input.mkv')
      await run(ffmpeg, [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=160x90:rate=24',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:sample_rate=48000',
        '-t',
        '18',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-g',
        '144',
        '-keyint_min',
        '144',
        '-sc_threshold',
        '0',
        '-c:a',
        'eac3',
        '-y',
        input,
      ])
      await gateway.start()
      const session = await controller
        .create({
          requestId: 'runtime',
          decision: {
            method: 'direct-stream',
            trial: false,
            container: { action: 'remux', target: 'fmp4-hls' },
            video: { action: 'copy', streamIndex: 0, sourceCodec: 'h264' },
            audio: {
              action: 'transcode',
              streamIndex: 1,
              sourceCodec: 'eac3',
              targetCodec: 'aac',
              profile: 'aac-low-complexity',
              sampleRate: 48000,
              channels: 2,
              encoderMode: 'software',
            },
            subtitle: { action: 'external-render' },
            reasons: [],
          },
          source: {
            kind: 'electron-file',
            path: input,
            name: 'input.mkv',
            hash: 'synthetic',
            size: 1,
          },
          startTime: 0,
          plan: {
            kind: 'copy-video-aac',
            reason: 'audio-incompatible',
            videoStreamIndex: 0,
            audioStreamIndex: 1,
            video: 'copy',
            audio: { codec: 'aac', profile: 'aac_low', sampleRate: 48000, channels: 2 },
            startupDeadlineMs: 10000,
          },
        })
        .catch((error) => {
          throw new Error(JSON.stringify(error.detail), { cause: error })
        })
      expect(session).toMatchObject({
        status: 'ready',
        lease: { hlsSessionMode: 'stable-vod', generation: 0 },
      })
      const manifest = await fetch(session.lease!.url, {
        headers: { Origin: 'http://renderer.local' },
      })
      expect(manifest.status).toBe(200)
      expect(await manifest.text()).toContain('#EXT-X-ENDLIST')
      const segment = await fetch(new URL('segments/1.m4s', session.lease!.url), {
        headers: { Origin: 'http://renderer.local' },
      })
      expect(segment.status).toBe(200)
      expect((await segment.arrayBuffer()).byteLength).toBeGreaterThan(0)
      await controller.releaseAll('renderer-crash')
      expect(scheduler.runningCount).toBe(0)
      expect(scheduler.pendingCount).toBe(0)
      expect(
        (await fetch(session.lease!.url, { headers: { Origin: 'http://renderer.local' } })).status,
      ).toBe(404)
    } finally {
      await controller.releaseAll('app-quit')
      await gateway.stop()
      scheduler.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 20000)
})
