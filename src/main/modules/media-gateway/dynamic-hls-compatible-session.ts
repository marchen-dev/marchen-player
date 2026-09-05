import type {
  HlsTimeline,
  MediaSessionEvent,
  MediaSessionSnapshot,
  MediaVideoStream,
  PipelineRuntimeChoice,
} from '@marchen/shared/media'
import type {
  CompatibleMediaSession,
  CompatibleSessionFactoryInput,
} from './compatible-session-factory'
import type { MediaGatewayRegistry } from './registry'
import type { DynamicHlsRequestCoordinator } from './dynamic-hls-coordinator'
import type { CompiledMediaPipeline } from '../ffmpeg/pipeline-compiler'
import type { H264Encoder } from '../ffmpeg/hls-preset'
import type { VideoDecoderCandidate } from '../ffmpeg/video-decoder'
import type { getFfmpegPlaybackBackend } from '../ffmpeg/service'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { InitFingerprintGuard, inspectInitFingerprint } from '../ffmpeg/init-fingerprint'
import { DynamicHlsJobSlot } from './dynamic-hls-job-slot'
import { DynamicHlsPublisher } from './dynamic-hls-publisher'
import { DynamicHlsSessionLifecycle } from './dynamic-hls-session-lifecycle'
import { compileDynamicHlsJob } from './dynamic-hls-job-compiler'
import { createDynamicHlsManifest } from './dynamic-hls-manifest'
import { segmentAtLogicalTime } from './hls-timeline'
import { SegmentStore } from './segment-store'
import { inspectSegmentMedia } from './segment-media-inspector'
import { MediaSourceIntegrityMonitor } from './resilience'
import { validateHlsProducerOutput } from './producer-validator'
import { MediaPipelineError, toMediaCompatError } from './errors'
import { runPreparationStage } from './preparation'
import { PlaybackJobManager } from './playback-job-manager'
import { PlaybackAheadWindowController } from './playback-ahead-window-controller'
import { PlaybackJobIdleController } from './playback-job-idle-controller'
import { createPipelineFingerprint } from '../ffmpeg/pipeline-fingerprint'
import { SegmentBackWindowCleaner } from './segment-back-window-cleaner'

/** 开发入口的保守基线：范围变化默认拒绝，已发布分片不删除。 */
export const createDynamicHlsCompatibleSession = async (
  options: CompatibleSessionFactoryInput & {
    registry: MediaGatewayRegistry
    coordinator: DynamicHlsRequestCoordinator
    backend: Awaited<ReturnType<typeof getFfmpegPlaybackBackend>>
    timeline: HlsTimeline
    pipeline: Exclude<CompiledMediaPipeline, { kind: 'direct' }>
    sourceVideo?: MediaVideoStream
    videoEncoder?: H264Encoder
    decoder?: VideoDecoderCandidate
  },
): Promise<CompatibleMediaSession> => {
  const { registration, request, backend, timeline, coordinator, registry } = options
  if (request.plan.kind === 'native') throw new Error('Dynamic HLS 需要兼容输出档位')
  if (!request.decision) throw new Error('Dynamic HLS 需要 generalized PlaybackDecision')
  const decision = request.decision
  const profile = request.plan
  const cache = await backend.cacheManager.createSession()
  const store = new SegmentStore(registration.id, timeline, (index) =>
    registry.unregisterEvictedResource(registration.id, `segment-${index}.m4s`),
  )
  // 当前反向删除/再生证据仅覆盖此组合，其他管线继续保留已发布分片。
  const backWindowValidated =
    options.videoEncoder === 'libx264' &&
    options.sourceVideo?.codecName === 'hevc' &&
    options.pipeline.kind === 'video-compatible' &&
    decision.audio?.sourceCodec === 'eac3'
  const cleaners = new Map<number, SegmentBackWindowCleaner>()
  const cleanBackWindow = async (seconds = 120) => {
    let cleaner = cleaners.get(seconds)
    if (!cleaner) {
      cleaner = new SegmentBackWindowCleaner({
        store,
        reverseRegenerationValidated: backWindowValidated,
        backWindowSeconds: seconds,
      })
      cleaners.set(seconds, cleaner)
    }
    await cleaner.clean()
  }
  const source = new MediaSourceIntegrityMonitor(request.source.path)
  try {
    await source.initialize()
  } catch (error) {
    await cache.release()
    throw error
  }
  const guard = new InitFingerprintGuard()
  let activeManager: PlaybackJobManager | undefined
  let stoppedForAhead = false
  let maintenanceBusy = false
  let maintenanceTimer: NodeJS.Timeout | undefined
  const listeners = new Set<(event: MediaSessionEvent) => void>()
  let snapshot: MediaSessionSnapshot = {
    id: registration.id,
    logicalSourceId: request.source.hash,
    mode:
      options.pipeline.kind === 'remux'
        ? 'remux'
        : options.pipeline.kind === 'audio-compatible'
          ? 'transcode-audio'
          : 'transcode-video',
    profile: profile.kind,
    decision: request.decision,
    attemptChain: request.attemptChain,
    attemptMethods: request.attemptMethods,
    activeGeneration: 0,
    status: 'preparing',
    phase: 'producing',
  }
  const changed = () => {
    snapshot = { ...snapshot, segmentStore: store.snapshot, job: activeManager?.snapshot }
    listeners.forEach((listener) => listener({ type: 'session-changed', session: snapshot }))
  }
  const slot = new DynamicHlsJobSlot({
    store,
    factory: {
      start: async ({ segmentIndex, owner, workingKey }) => {
        await cache.reserve(0)
        const directory = join(cache.directory, workingKey)
        await mkdir(directory)
        const useAudioPreroll =
          options.pipeline.kind === 'audio-compatible' &&
          options.sourceVideo?.codecName === 'hevc' &&
          request.decision?.audio?.sourceCodec === 'eac3' &&
          segmentIndex > 0
        if (useAudioPreroll && timeline.segments[segmentIndex]!.duration <= 0.5) {
          throw new MediaPipelineError({
            code: 'hls-timeline-unavailable',
            stage: 'planning',
            message: 'HEVC 极短尾片尚未验证预卷定位，使用旧 transport',
            recoverable: true,
          })
        }
        const compiled = compileDynamicHlsJob({
          pipeline: options.pipeline,
          timeline,
          segmentIndex,
          inputPath: request.source.path,
          outputDirectory: directory,
          sourceVideo: options.sourceVideo,
          audioEncoder: 'aac',
          videoEncoder: options.videoEncoder,
          decoder: options.decoder,
          // 当前已验证 HEVC copy + AAC：demux 定位跨过关键帧 DTS 的舍入边界，
          // 音频保留预卷后另按逻辑切点裁剪，不能随输入 seek 一起丢掉半秒。
          ...(useAudioPreroll ? { seekOffsetSeconds: 0.5, audioPreroll: true } : {}),
        })
        const controller = new AbortController()
        const runtime: PipelineRuntimeChoice = {
          videoDecoder: options.decoder
            ? { name: options.decoder.name, class: 'software' }
            : undefined,
          videoEncoder: {
            name: options.videoEncoder ?? 'copy',
            class: options.videoEncoder ? 'software' : 'copy',
          },
          audioEncoder: {
            name: request.decision?.audio?.action === 'transcode' ? 'aac' : 'copy',
            class: request.decision?.audio?.action === 'transcode' ? 'software' : 'copy',
          },
        }
        const manager = new PlaybackJobManager({
          id: owner.jobId,
          sessionId: registration.id,
          pipeline: createPipelineFingerprint(decision, runtime),
          runtime,
          coverage: { startSegment: segmentIndex },
          requestedStartTime: timeline.segments[segmentIndex]!.startTime,
        })
        manager.requestStart()
        activeManager = manager
        changed()
        stoppedForAhead = false
        let idle: PlaybackJobIdleController | undefined
        let activityTimer: NodeJS.Timeout | undefined
        const publisher = new DynamicHlsPublisher({
          registry,
          sessionId: registration.id,
          token: registration.token,
          outputDirectory: directory,
          store,
          owner,
          ptsToleranceSeconds: 0.15,
          requireAudio: options.pipeline.plan.audioStreamIndex !== undefined,
          initFingerprintGuard: guard,
          inspectInitFingerprint: (initPath) =>
            inspectInitFingerprint({
              ffprobe: backend.runtime.paths.ffprobe,
              executor: backend.executor,
              initPath,
              signal: controller.signal,
            }),
          inspectSegment: (initPath, segmentPath) =>
            inspectSegmentMedia({
              ffprobe: backend.runtime.paths.ffprobe,
              executor: backend.executor,
              initPath,
              segmentPath,
              signal: controller.signal,
            }),
          validateReady: (paths) =>
            validateHlsProducerOutput({
              ...paths,
              ffprobe: backend.runtime.paths.ffprobe,
              executor: backend.executor,
              profile,
              expectedAudioCodec:
                request.decision?.audio?.action === 'copy'
                  ? request.decision.audio.sourceCodec
                  : profile.audio
                    ? 'aac'
                    : undefined,
              sourceVideo: options.sourceVideo,
              signal: controller.signal,
            }),
        })
        let stopping = false
        let completed = false
        let publication = Promise.resolve()
        let publicationError: unknown
        const refresh = () => {
          publication = publication
            .then(async () => {
              if (stopping || publicationError) return
              // progress 可早于第一份清单，只跳过 ENOENT；媒体验证失败必须结束生产。
              try {
                await stat(compiled.preset.output.manifestPath)
              } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
                throw error
              }
              await cache.reserve(0)
              await publisher.refresh()
              const produced: import('@marchen/shared/media').SegmentStoreEntrySnapshot[] = []
              for (const entry of store.snapshot.entries.slice(segmentIndex)) {
                if (entry.status !== 'published') break
                produced.push(entry)
              }
              slot.updateCoverage(owner.jobId, {
                startSegment: segmentIndex,
                endSegment: produced.at(-1)?.index,
              })
              if (manager.snapshot.phase === 'producing')
                manager.reportCoverageEvidence({
                  coverage: { startSegment: segmentIndex, endSegment: produced.at(-1)?.index },
                })
              changed()
            })
            .catch((error) => {
              publicationError ??= error
              controller.abort(error)
            })
        }
        const finished = backend.scheduler
          .schedule({
            kind: 'playback',
            weight: 'heavy',
            signal: controller.signal,
            run: async (signal) => {
              manager.reportProducingEvidence()
              const execution = backend.executor.start({
                executable: backend.runtime.paths.ffmpeg,
                arguments: compiled.preset.arguments,
                inputs: compiled.preset.inputs,
                gracefulStdin: true,
                signal,
                progress: true,
                onProgress: (record) => {
                  if (!stopping)
                    manager.reportProgressEvidence(record, store.snapshot, Date.now(), true)
                  refresh()
                },
              })
              idle = new PlaybackJobIdleController({
                manager,
                execution: {
                  result: execution.result,
                  stop: () => {
                    stopping = true
                    execution.stop()
                    void slot.releaseImmediately().catch(console.warn)
                  },
                },
              })
              const ahead = new PlaybackAheadWindowController({
                manager,
                execution: {
                  result: execution.result,
                  // 已验证 stop/restart；跨平台进程暂停尚未验证，60 秒使用停止基线。
                  stop: () => {
                    stoppedForAhead = true
                    stopping = true
                    execution.stop()
                    void slot.releaseImmediately().catch(console.warn)
                  },
                },
              })
              let checking = false
              activityTimer = setInterval(() => {
                if (checking || stopping || completed) return
                checking = true
                manager.reportStoreEvidence(store.snapshot)
                void (async () => {
                  if (await idle!.check()) return
                  const state = store.snapshot
                  if (!state.entries.some((e) => e.waiterCount) && !state.initWaiterCount)
                    await ahead.evaluate(state)
                })()
                  .catch(console.warn)
                  .finally(() => {
                    checking = false
                  })
              }, 1_000)
              activityTimer.unref()
              await execution.result
              refresh()
              await publication
              if (publicationError) throw publicationError
            },
          })
          .catch((cause) => {
            if (stopping) return
            const error = toMediaCompatError(publicationError ?? cause, {
              code: 'generation-failed',
              stage: 'transcode',
              message: 'Dynamic HLS 生产失败',
              recoverable: true,
            })
            if (slot.owner?.epoch !== owner.epoch) return
            console.warn('[dynamic-hls]', {
              code: error.code,
              stage: error.stage,
              reason: error.cause ?? error.message,
            })
            manager.reportFailure(error)
            store.cancelPending(error)
            snapshot = { ...snapshot, status: 'failed', phase: 'failed', error }
            changed()
          })
          .finally(() => {
            completed = true
            if (activityTimer) clearInterval(activityTimer)
            idle?.dispose()
            if (manager.snapshot.phase !== 'stopped' && manager.snapshot.phase !== 'failed')
              manager.reportStoppedEvidence()
            changed()
          })
        return {
          id: owner.jobId,
          isRunning: () => !completed,
          coverage: { startSegment: segmentIndex },
          stop: async () => {
            stopping = true
            // abort 同时取消排队任务和 probe，executor 会等待实际 close 后才完成 result。
            controller.abort(new Error('Dynamic HLS Job 已停止'))
            await finished
            await publication
          },
        }
      },
    },
  })
  const lifecycle = new DynamicHlsSessionLifecycle({
    token: registration.token,
    store,
    coordinator,
    jobSlot: slot,
    source,
  })
  let releasing: Promise<void> | undefined
  const release: NonNullable<CompatibleMediaSession['handleLifecycle']> = (event) =>
    (releasing ??= (async () => {
      if (maintenanceTimer) clearInterval(maintenanceTimer)
      await lifecycle.handle(event)
      registry.releaseSession(registration.id)
      // 活动 HTTP 流仍持有文件引用；等流结束后才能删除会话目录（Windows 同样适用）。
      const deadline = Date.now() + 10_000
      while (
        store.snapshot.initActiveRequestCount ||
        store.snapshot.entries.some((entry) => entry.activeRequestCount)
      ) {
        if (Date.now() >= deadline) throw new Error('HTTP 响应未释放，保留缓存等待下次清理')
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      await cache.release()
      snapshot = { ...snapshot, status: 'released', phase: 'released', lease: undefined }
      changed()
    })())
  coordinator.register(registration.token, store, {
    request: async (index) => {
      if ((await lifecycle.checkSource()) === 'released') throw new Error('Dynamic HLS 源已变化')
      await slot.ensure(index)
    },
  })
  return {
    get session() {
      return snapshot
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    start: async () => {
      try {
        const manifestPath = join(cache.directory, 'index.m3u8')
        const manifest = createDynamicHlsManifest(timeline)
        await writeFile(manifestPath, manifest)
        if (lifecycle.released) throw new Error('Dynamic HLS 会话已释放')
        registry.registerStableResource(registration.id, 'index.m3u8', {
          path: manifestPath,
          mimeType: 'application/vnd.apple.mpegurl',
          cacheControl: 'private, max-age=31536000, immutable',
          complete: true,
          sizeBytes: Buffer.byteLength(manifest),
        })
        const index = segmentAtLogicalTime(timeline, request.startTime)!.index
        await runPreparationStage('job', (signal) => slot.ensure(index, signal), {
          signal: options.signal,
        })
        await runPreparationStage(
          'segment',
          (signal) => store.waitFor(index, { timeoutMs: 3_000, signal }),
          { signal: options.signal, deadlineMs: 3_000 },
        )
        if (lifecycle.released) throw new Error('Dynamic HLS 会话已释放')
        snapshot = {
          ...snapshot,
          status: 'ready',
          phase: 'producer-ready',
          lease: {
            id: registration.id,
            logicalSourceId: request.source.hash,
            mode: snapshot.mode,
            profile: profile.kind,
            decision: request.decision,
            attemptMethods: request.attemptMethods,
            attemptChain: request.attemptChain,
            transport: 'hls',
            hlsSessionMode: 'stable-vod',
            url: `${options.gatewayUrl}/v2/media/${registration.token}/index.m3u8`,
            mimeType: 'application/vnd.apple.mpegurl',
            sessionId: registration.id,
            generation: 0,
            hlsTimeline: timeline,
            timeline: { originalDuration: timeline.duration, offset: 0, calibrated: true },
          },
        }
        maintenanceTimer = setInterval(() => {
          if (maintenanceBusy || lifecycle.released) return
          maintenanceBusy = true
          void (async () => {
            if (slot.current?.isRunning?.() !== true && backWindowValidated) await cleanBackWindow()
            if (lifecycle.released || !stoppedForAhead) return
            const state = store.snapshot
            if (
              state.consumptionPosition === undefined ||
              Date.now() - (state.lastClientActivityAt ?? 0) > 60_000
            )
              return
            const end = state.continuousPublishedEnd ?? state.consumptionPosition
            if (end - state.consumptionPosition > 20) return
            const next = timeline.segments.find((s) => s.endTime > end)
            if (next) await slot.ensure(next.index)
          })()
            .catch(console.warn)
            .finally(() => {
              maintenanceBusy = false
            })
        }, 1_000)
        maintenanceTimer.unref()
        changed()
        return snapshot
      } catch (error) {
        await release('release')
        throw error
      }
    },
    seek: async () => {
      throw new Error('stable-vod seek 由分片请求驱动，不创建 generation')
    },
    acknowledge: (generation, phase, error) => {
      if (generation !== 0 || lifecycle.released) throw new Error('Dynamic HLS 会话已过期')
      snapshot = { ...snapshot, phase, status: phase === 'failed' ? 'failed' : 'ready', error }
      changed()
      return snapshot
    },
    handleLifecycle: release,
    stopProduction: () => slot.releaseImmediately(),
    cleanBackWindow: async (backWindowSeconds) => {
      await slot.releaseImmediately()
      await cleanBackWindow(backWindowSeconds)
      changed()
    },
    reportPlayback: (position) => {
      store.reportPlaybackPosition(position)
      activeManager?.reportStoreEvidence(store.snapshot)
      changed()
    },
    release: () => release('release'),
  }
}
