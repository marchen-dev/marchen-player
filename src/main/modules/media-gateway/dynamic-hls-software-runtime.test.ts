import type { PlaybackDecision, PlaybackPlan, MediaVideoStream } from '@marchen/shared/media'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { FfmpegProcessExecutor } from '../ffmpeg/executor'
import { FfmpegTaskScheduler } from '../ffmpeg/scheduler'
import { FfmpegMediaTools } from '../ffmpeg/media-tools'
import { resolveFfmpegRuntime } from '../ffmpeg/runtime'
import { MediaCacheManager } from '../ffmpeg/cache'
import { KeyframeMetadataCache } from '../ffmpeg/keyframe-cache'
import { createDynamicHlsSessionFactory } from './dynamic-hls-session-factory'
import { MediaGatewayRegistry } from './registry'
import { DynamicHlsRequestCoordinator } from './dynamic-hls-coordinator'

const fixtures = [
  'hevc-main8-aac.mp4',
  'hevc-main10-eac3-5.1.mkv',
  'structure-hdr10-eac3-long-gop.mkv',
  'structure-hlg-long-gop.mkv',
  'formal-app-hevc-eac3-timeline.mkv',
]
const directory = resolve('test-results/media-compat')
describe.runIf(fixtures.every((name) => existsSync(join(directory, name))))(
  'v2 软件转码真实输出',
  () => {
    it.each(fixtures)(
      '%s 经真实 preflight 与正式 factory 输出 H.264，独立决定音频动作',
      async (name) => {
        const root = await mkdtemp(join(tmpdir(), 'marchen-v2-software-'))
        const executor = new FfmpegProcessExecutor()
        const productions: import('../ffmpeg/executor').FfmpegExecution[] = []
        const realStart = executor.start.bind(executor)
        vi.spyOn(executor, 'start').mockImplementation((options) => {
          const producer = options.arguments.includes('-hls_segment_filename')
          const args = [...options.arguments]
          // 限速仅用于实验，保证停止时生产进程仍在运行，不把自然退出当作主动停止。
          if (producer && name.startsWith('formal-app'))
            args.splice(args.indexOf('-i'), 0, '-readrate', '16', '-readrate_initial_burst', '24')
          const execution = realStart({ ...options, arguments: args })
          if (producer) productions.push(execution)
          return execution
        })
        const scheduler = new FfmpegTaskScheduler()
        try {
          const resolved = await resolveFfmpegRuntime({
            isPackaged: false,
            resourcesPath: '',
            developmentRoot: resolve('.'),
            runner: {
              run: async (executable, args) => {
                const output = await executor.run({ executable, arguments: args, kind: 'probe' })
                return { stdout: output.stdout.toString(), stderr: output.stderr }
              },
            },
          })
          if (!resolved.ok) throw new Error(resolved.error.message)
          const runtime = resolved.runtime
          const tools = new FfmpegMediaTools(
            runtime.paths,
            { screenshots: root, subtitles: root },
            executor,
            scheduler,
          )
          const path = join(directory, name)
          const facts = await tools.probe(path, name)
          const video = facts.streams.find(
            (s): s is MediaVideoStream =>
              s.type === 'video' && s.index === facts.primaryVideoStreamIndex,
          )!
          const audio = facts.streams.find(
            (s) => s.type === 'audio' && s.index === facts.primaryAudioStreamIndex,
          )
          const hdr = video.dynamicRange === 'hdr10' || video.dynamicRange === 'hlg'
          const copyAudio = audio?.codecName === 'aac'
          const decision: PlaybackDecision = {
            method: 'transcode',
            trial: false,
            container: { action: 'remux', target: 'fmp4-hls' },
            video: {
              action: 'transcode',
              streamIndex: video.index,
              sourceCodec: video.codecName,
              targetCodec: 'h264',
              pixelFormat: 'yuv420p',
              toneMap: hdr ? 'hdr-to-sdr' : 'none',
              decoderMode: 'software',
              encoderMode: 'software',
            },
            audio: audio
              ? copyAudio
                ? { action: 'copy', streamIndex: audio.index, sourceCodec: audio.codecName }
                : {
                    action: 'transcode',
                    streamIndex: audio.index,
                    sourceCodec: audio.codecName,
                    targetCodec: 'aac',
                    profile: 'aac-low-complexity',
                    sampleRate: 48000,
                    channels: 2,
                    encoderMode: 'software',
                  }
              : undefined,
            subtitle: { action: 'external-render' },
            reasons: [],
          }
          const base = {
            reason: 'video-incompatible' as const,
            videoStreamIndex: video.index,
            audioStreamIndex: audio?.index,
            audio:
              audio && !copyAudio
                ? {
                    codec: 'aac' as const,
                    profile: 'aac_low' as const,
                    sampleRate: 48000 as const,
                    channels: 2 as const,
                  }
                : undefined,
          }
          const plan: PlaybackPlan = hdr
            ? {
                ...base,
                kind: 'hdr-to-sdr-h264-aac',
                video: { codec: 'h264', pixelFormat: 'yuv420p', toneMapToSdr: true },
              }
            : {
                ...base,
                kind: 'safe-h264-aac-sdr',
                video: { codec: 'h264', pixelFormat: 'yuv420p', toneMapToSdr: false },
              }
          const registry = new MediaGatewayRegistry()
          const coordinator = new DynamicHlsRequestCoordinator()
          const factory = createDynamicHlsSessionFactory(registry, coordinator, {
            getBackend: async () => ({
              runtime,
              executor,
              scheduler,
              cacheManager: new MediaCacheManager({ root: join(root, 'cache') }),
            }),
            getTools: async () => tools,
            getKeyframeCache: () => new KeyframeMetadataCache(join(root, 'keys')),
          })
          for (const startTime of facts.duration > 20 && !name.startsWith('formal-app')
            ? [0, 14]
            : [0]) {
            const registration = registry.createSession(name)
            const session = await factory({
              registration,
              gatewayUrl: 'http://127.0.0.1:1234',
              request: {
                requestId: name,
                source: { kind: 'electron-file', path, name, hash: name, size: 1 },
                decision,
                plan,
                startTime,
              },
            })
            try {
              const snapshot = await session.start()
              expect(snapshot).toMatchObject({
                mode: 'transcode-video',
                status: 'ready',
                lease: { hlsSessionMode: 'stable-vod' },
              })
              const init = registry.resolveStable(registration.token, 'init.mp4')!
              const segment = registry.resolveStable(
                registration.token,
                `segment-${Math.floor(startTime / 2)}.m4s`,
              )!
              const probePath = join(root, 'first.mp4')
              await writeFile(
                probePath,
                Buffer.concat([await readFile(init.path), await readFile(segment.path)]),
              )
              const output = await executor.run({
                executable: runtime.paths.ffprobe,
                arguments: ['-v', 'error', '-show_streams', '-of', 'json', probePath],
                inputs: [probePath],
                kind: 'probe',
              })
              const tracks = JSON.parse(output.stdout.toString()).streams as Array<{
                codec_type: string
                codec_name: string
                pix_fmt?: string
                color_transfer?: string
              }>
              expect(tracks.find((s) => s.codec_type === 'video')).toMatchObject({
                codec_name: 'h264',
                pix_fmt: 'yuv420p',
              })
              if (hdr)
                expect(tracks.find((s) => s.codec_type === 'video')?.color_transfer).toBe('bt709')
              if (audio)
                expect(tracks.find((s) => s.codec_type === 'audio')?.codec_name).toBe(
                  copyAudio ? audio.codecName : 'aac',
                )
              if (name.startsWith('formal-app')) {
                const originalInit = await readFile(init.path)
                const originalSegment = await readFile(segment.path)
                const pid = productions.at(-1)!.pid!
                expect(() => process.kill(pid, 0)).not.toThrow()
                await session.stopProduction!()
                expect(() => process.kill(pid, 0)).toThrow()
                expect(session.session?.status).toBe('ready')
                const prior = session.session!.segmentStore!.entries.filter(
                  (e) => e.status === 'published',
                )
                const nextIndex = prior.at(-1)!.index + 1
                const acquired = await coordinator.requestSegment(registration.token, nextIndex)
                expect(acquired).toBeDefined()
                acquired!.release()
                expect(productions.length).toBe(2)
                expect(
                  await readFile(registry.resolveStable(registration.token, 'init.mp4')!.path),
                ).toEqual(originalInit)
                expect(await readFile(segment.path)).toEqual(originalSegment)
                const next = session.session!.segmentStore!.entries[nextIndex]!
                expect(next.status).toBe('published')
                expect(next.actualRange).toBeDefined()
                await writeFile(
                  join(directory, 'formal-software-stop-restart.json'),
                  JSON.stringify(
                    {
                      scope: 'real-process-stop-restart-formal-publisher',
                      oldPidExited: true,
                      stableInitAndSegment: true,
                      before: prior.at(-1),
                      after: next,
                    },
                    null,
                    2,
                  ),
                )
                session.reportPlayback!(0)
                const until = async (test: () => boolean) => {
                  const deadline = Date.now() + 12_000
                  while (!test()) {
                    if (Date.now() > deadline) throw new Error('资源控制等待超时')
                    await new Promise((r) => setTimeout(r, 50))
                  }
                }
                await until(() => session.session?.job?.phase === 'stopped')
                const throttled = session.session!
                expect(throttled.segmentStore!.continuousPublishedEnd).toBeGreaterThanOrEqual(60)
                expect(throttled.segmentStore!.continuousPublishedEnd).toBeLessThan(120)
                expect(throttled.status).toBe('ready')
                session.reportPlayback!(throttled.segmentStore!.continuousPublishedEnd! - 15)
                await until(() => productions.length === 3)
                expect(session.session!.job!.id).not.toBe(throttled.job!.id)
                await writeFile(
                  join(directory, 'formal-software-ahead-resume.json'),
                  JSON.stringify(
                    {
                      scope: 'formal-v2-resource-control',
                      stopped: throttled.job,
                      playbackPosition: session.session!.segmentStore!.consumptionPosition,
                      resumedJob: session.session!.job,
                    },
                    null,
                    2,
                  ),
                )
                session.reportPlayback!(80)
                const protectedRead = await coordinator.requestSegment(registration.token, 0)
                await session.cleanBackWindow!(20)
                expect(registry.resolveStable(registration.token, 'segment-0.m4s')).toBeDefined()
                protectedRead!.release()
                await session.cleanBackWindow!(20)
                expect(registry.resolveStable(registration.token, 'segment-0.m4s')).toBeUndefined()
                expect(existsSync(segment.path)).toBe(false)
                session.reportPlayback!(10)
                const reverse = await coordinator.requestSegment(registration.token, 5)
                expect(reverse).toBeDefined()
                const reversed = join(root, 'regenerated.mp4')
                await writeFile(
                  reversed,
                  Buffer.concat([originalInit, await readFile(reverse!.resource.path)]),
                )
                reverse!.release()
                const pixels = await executor.run({
                  executable: runtime.paths.ffmpeg,
                  arguments: [
                    '-v',
                    'error',
                    '-i',
                    reversed,
                    '-an',
                    '-frames:v',
                    '1',
                    '-pix_fmt',
                    'rgb24',
                    '-f',
                    'rawvideo',
                    'pipe:1',
                  ],
                  inputs: [reversed],
                  stdoutLimitBytes: 320 * 180 * 3 + 256,
                })
                let frameNumber = 0
                for (let bit = 0; bit < 12; bit++)
                  if (pixels.stdout[(8 * 320 + bit * 24 + 12) * 3]! > 128) frameNumber += 2 ** bit
                expect(Math.abs(frameNumber / 24 - 10)).toBeLessThan(0.15)
                await writeFile(
                  join(directory, 'formal-software-back-regeneration.json'),
                  JSON.stringify(
                    {
                      scope:
                        'formal-v2-real-file-eviction-and-reverse-regeneration; test back window 20s',
                      activeReadProtected: true,
                      evictedFileRemoved: true,
                      target: 10,
                      contentTime: frameNumber / 24,
                      segment: session.session!.segmentStore!.entries[5],
                    },
                    null,
                    2,
                  ),
                )
              }
              await writeFile(
                join(directory, `formal-software-${name}-${startTime}.json`),
                JSON.stringify(
                  {
                    fixture: name,
                    scope: 'formal-factory-output',
                    decision,
                    output: tracks,
                    startTime,
                    firstSegment: snapshot.segmentStore?.entries[Math.floor(startTime / 2)],
                  },
                  null,
                  2,
                ),
              )
            } finally {
              await session.release()
            }
            expect(scheduler.runningCount).toBe(0)
          }
        } finally {
          scheduler.close()
          await rm(root, { recursive: true, force: true })
        }
      },
      40000,
    )
  },
)
