import type {
  MediaSessionEvent,
  MediaSessionSnapshot,
  MediaStream,
  MediaVideoStream,
  PlaybackMode,
  PlaybackPlan,
  PrepareMediaSessionRequest,
  RemuxPlaybackPlan,
  TranscodeAudioPlaybackPlan,
  TranscodeVideoPlaybackPlan,
} from '@marchen/shared/media'
import type { FfmpegExecution, FfmpegExecutionResult } from '../ffmpeg/executor'
import type { AacEncoder } from '../ffmpeg/audio-encoder'
import type { VideoDecoderCandidate } from '../ffmpeg/video-decoder'
import type { GatewaySessionRegistration, MediaGatewayRegistry } from './registry'
import type { SeekableGenerationFactoryInput } from './seekable-transcode-session'
import type { TranscodeGenerationContext, TranscodeGenerationProducer } from './transcode-session'
import type { DynamicHlsLifecycleEvent } from './dynamic-hls-session-lifecycle'
import {
  createH264EncoderInitializationArguments,
  createH264PipelinePreflightArguments,
  createRemuxHlsPreset,
  createTranscodeAudioHlsPreset,
  createTranscodeVideoHlsPreset,
  selectInitializedH264Encoder,
} from '../ffmpeg/hls-preset'
import {
  aacEncoderClass,
  createAacEncoderInitializationArguments,
  selectInitializedAacEncoder,
} from '../ffmpeg/audio-encoder'
import {
  createHardwareVideoDecoderCandidates,
  createSoftwareVideoDecoderCandidate,
  selectInitializedVideoDecoder,
  verifyVideoDecoderCandidate,
} from '../ffmpeg/video-decoder'
import { getFfmpegMediaTools, getFfmpegPlaybackBackend } from '../ffmpeg/service'
import {
  calibrateGenerationTimeline,
  probeFirstOutputTimestamp,
} from '../ffmpeg/timeline-calibration'
import { MediaPipelineError, toMediaCompatError } from './errors'
import { HlsGenerationPublisher } from './hls-generation-publisher'
import { validateHlsProducerOutput } from './producer-validator'
import { SeekableTranscodeSession } from './seekable-transcode-session'
import { TranscodeSession } from './transcode-session'
import { runPreparationStage } from './preparation'

export interface CompatibleMediaSession {
  readonly session: MediaSessionSnapshot | undefined
  subscribe: (listener: (event: MediaSessionEvent) => void) => () => void
  start: () => Promise<MediaSessionSnapshot>
  seek: (expectedGeneration: number, logicalTime: number) => Promise<MediaSessionSnapshot>
  acknowledge: (
    generation: number,
    phase: 'attaching' | 'playable' | 'failed',
    error?: import('@marchen/shared/media').MediaCompatError,
  ) => MediaSessionSnapshot
  release: () => Promise<void>
  handleLifecycle?: (event: DynamicHlsLifecycleEvent) => Promise<void>
  /** 临时停止生产，保留稳定资源；后续缺片请求可重新启动 Job。 */
  stopProduction?: () => Promise<void>
  reportPlayback?: (position: number) => void
  cleanBackWindow?: (backWindowSeconds?: number) => Promise<void>
}

export interface CompatibleSessionFactoryInput {
  registration: GatewaySessionRegistration
  request: PrepareMediaSessionRequest
  gatewayUrl: string
  signal?: AbortSignal
}

export type CompatibleSessionFactory = (
  input: CompatibleSessionFactoryInput,
) => Promise<CompatibleMediaSession>

export interface CompatibleSessionFactoryDependencies {
  getBackend: typeof getFfmpegPlaybackBackend
  probe: (
    sourcePath: string,
    sourceId: string,
    signal?: AbortSignal,
  ) => ReturnType<Awaited<ReturnType<typeof getFfmpegMediaTools>>['probe']>
  platform: NodeJS.Platform
}

const defaultDependencies: CompatibleSessionFactoryDependencies = {
  getBackend: getFfmpegPlaybackBackend,
  probe: (sourcePath, sourceId, signal) =>
    getFfmpegMediaTools().then((tools) => tools.probe(sourcePath, sourceId, signal)),
  platform: process.platform,
}

const selectedVideo = (
  streams: ReadonlyArray<MediaStream>,
  streamIndex: number,
): MediaVideoStream | undefined =>
  streams.find(
    (stream): stream is MediaVideoStream => stream.type === 'video' && stream.index === streamIndex,
  )

type CompatibleOutputProfile = Exclude<PlaybackPlan, { kind: 'native' }>

const modeForProfile = (plan: CompatibleOutputProfile): Exclude<PlaybackMode, 'direct'> =>
  plan.kind === 'copy-video-aac' ? 'transcode-audio' : 'transcode-video'

const legacyRemuxPlan = (plan: CompatibleOutputProfile): RemuxPlaybackPlan => ({
  kind: 'remux',
  reason: plan.reason,
  videoStreamIndex: plan.videoStreamIndex,
  ...(plan.audioStreamIndex === undefined ? {} : { audioStreamIndex: plan.audioStreamIndex }),
  video: 'copy',
  audio: 'copy',
})

const legacyAudioPlan = (
  plan: Extract<CompatibleOutputProfile, { kind: 'copy-video-aac' }>,
): TranscodeAudioPlaybackPlan => ({
  kind: 'transcode-audio',
  reason: plan.reason,
  videoStreamIndex: plan.videoStreamIndex,
  audioStreamIndex: plan.audioStreamIndex!,
  video: 'copy',
  audio: plan.audio!,
})

const legacyVideoPlan = (
  plan: Exclude<CompatibleOutputProfile, { kind: 'copy-video-aac' }>,
): TranscodeVideoPlaybackPlan => ({
  kind: 'transcode-video',
  reason: plan.reason,
  videoStreamIndex: plan.videoStreamIndex,
  ...(plan.audioStreamIndex === undefined ? {} : { audioStreamIndex: plan.audioStreamIndex }),
  video: { codec: 'h264', toneMapToSdr: plan.video.toneMapToSdr },
  audio: plan.audio ?? 'copy',
})

const createPreset = (options: {
  plan: CompatibleOutputProfile
  inputPath: string
  outputDirectory: string
  startTime: number
  sourceVideo?: MediaVideoStream
  encoder?: Awaited<ReturnType<typeof selectInitializedH264Encoder>>
  audioEncoder?: AacEncoder
  decoder?: VideoDecoderCandidate
}) => {
  const base = {
    inputPath: options.inputPath,
    outputDirectory: options.outputDirectory,
    startTime: options.startTime,
  }
  switch (options.plan.kind) {
    case 'copy-video-aac':
      if (options.plan.audioStreamIndex === undefined || !options.plan.audio) {
        return createRemuxHlsPreset({
          ...base,
          plan: legacyRemuxPlan(options.plan),
          sourceVideo: options.sourceVideo,
        })
      }
      return createTranscodeAudioHlsPreset({
        ...base,
        plan: legacyAudioPlan(options.plan),
        sourceVideo: options.sourceVideo,
        audioEncoder: options.audioEncoder,
      })
    case 'safe-h264-aac-sdr':
    case 'hdr-to-sdr-h264-aac':
      if (!options.encoder) throw new Error('H.264 编码器尚未初始化')
      return createTranscodeVideoHlsPreset({
        ...base,
        plan: legacyVideoPlan(options.plan),
        encoder: options.encoder,
        sourceVideo: options.sourceVideo,
        audioEncoder: options.audioEncoder,
        decoderInputArguments: options.decoder?.inputArguments,
      })
  }
}

/**
 * 将 FFmpeg 长任务接入调度器，同时把 progress 驱动的发布串行化。
 * refresh 只登记已经由 FFmpeg 原子 rename 的文件，因此 Renderer 永远看不到半个分片。
 */
const createScheduledProducer =
  (options: {
    executable: string
    ffprobe: string
    plan: CompatibleOutputProfile
    sourcePath: string
    sourceVideo?: MediaVideoStream
    encoder?: Awaited<ReturnType<typeof selectInitializedH264Encoder>>
    audioEncoder?: AacEncoder
    decoder?: VideoDecoderCandidate
    sessionId: string
    logicalSourceId: string
    token: string
    generation: number
    gatewayUrl: string
    originalDuration: number
    originalStartTime: number
    requestedStartTime: number
    registry: MediaGatewayRegistry
    executor: Awaited<ReturnType<typeof getFfmpegPlaybackBackend>>['executor']
    scheduler: Awaited<ReturnType<typeof getFfmpegPlaybackBackend>>['scheduler']
    attemptChain: PrepareMediaSessionRequest['attemptChain']
    attemptMethods: PrepareMediaSessionRequest['attemptMethods']
    decision: PrepareMediaSessionRequest['decision']
  }): TranscodeGenerationProducer =>
  (context: TranscodeGenerationContext): FfmpegExecution => {
    const controller = new AbortController()
    const cancel = () => controller.abort('compatible-generation-cancelled')
    let activeExecution: FfmpegExecution | undefined
    const stop = () => activeExecution?.stop() ?? cancel()
    context.signal.addEventListener('abort', cancel, { once: true })
    const preset = createPreset({
      plan: options.plan,
      inputPath: options.sourcePath,
      outputDirectory: context.directory,
      startTime: options.requestedStartTime,
      sourceVideo: options.sourceVideo,
      encoder: options.encoder,
      audioEncoder: options.audioEncoder,
      decoder: options.decoder,
    })
    const publisher = new HlsGenerationPublisher({
      registry: options.registry,
      sessionId: options.sessionId,
      token: options.token,
      generation: options.generation,
      outputDirectory: context.directory,
      validateReady: ({ manifestPath, initPath, firstSegmentPath }) =>
        validateHlsProducerOutput({
          ffprobe: options.ffprobe,
          executor: options.executor,
          manifestPath,
          initPath,
          firstSegmentPath,
          profile: options.plan,
          sourceVideo: options.sourceVideo,
          signal: controller.signal,
        }),
    })
    let ready = false
    let publication = Promise.resolve()
    let publicationError: unknown

    const refresh = () => {
      publication = publication
        .then(async () => {
          await context.ensureCacheBudget()
          const published = await publisher.refresh()
          context.reportPublication({
            segmentCount: published.segmentCount,
            producedDuration: published.segmentDuration,
          })
          if (!published.ready || ready || controller.signal.aborted) return
          let actualFirstOutputTimestamp: number | undefined
          try {
            actualFirstOutputTimestamp = await probeFirstOutputTimestamp({
              ffprobe: options.ffprobe,
              manifestPath: preset.output.manifestPath,
              executor: options.executor,
              signal: controller.signal,
            })
            context.recordFirstTimestamp(actualFirstOutputTimestamp)
          } catch {
            // 首 PTS 探测失败不应丢弃已经完整发布的媒体；时间线会明确保持未校准。
          }
          const calibration = calibrateGenerationTimeline({
            originalDuration: options.originalDuration,
            originalStartTime: options.originalStartTime,
            requestedStartTime: options.requestedStartTime,
            actualFirstOutputTimestamp,
          })
          ready = true
          context.markReady({
            id: `${options.sessionId}:${options.generation}`,
            logicalSourceId: options.logicalSourceId,
            mode: modeForProfile(options.plan),
            profile: options.plan.kind,
            attemptChain: options.attemptChain,
            attemptMethods: options.attemptMethods,
            decision: options.decision,
            transport: 'hls',
            hlsSessionMode: 'generation',
            url: `${options.gatewayUrl}/v1/media/${options.token}/g/${options.generation}/index.m3u8`,
            mimeType: 'application/vnd.apple.mpegurl',
            sessionId: options.sessionId,
            generation: options.generation,
            timeline: calibration.timeline,
          })
        })
        .catch((error) => {
          publicationError = error
          controller.abort(error)
        })
    }

    const result = options.scheduler
      .schedule({
        kind: 'playback',
        weight: 'heavy',
        signal: controller.signal,
        run: async (signal): Promise<FfmpegExecutionResult> => {
          const execution = options.executor.start({
            executable: options.executable,
            arguments: preset.arguments,
            inputs: preset.inputs,
            signal,
            progress: true,
            onProgress: (record) => {
              context.reportProgress(record)
              refresh()
            },
          })
          activeExecution = execution
          let executionResult: FfmpegExecutionResult
          try {
            executionResult = await execution.result
          } catch (error) {
            await publication
            if (publicationError) throw publicationError
            throw error
          }
          refresh()
          await publication
          if (publicationError) throw publicationError
          return executionResult
        },
      })
      .finally(() => context.signal.removeEventListener('abort', cancel))

    return { result, stop, cancel }
  }

export const createCompatibleSessionFactory =
  (
    registry: MediaGatewayRegistry,
    dependencies: CompatibleSessionFactoryDependencies = defaultDependencies,
  ): CompatibleSessionFactory =>
  async ({ registration, request, gatewayUrl, signal: preparationSignal }) => {
    if (request.plan.kind === 'native') throw new Error('native 档位不能创建转码会话')
    const plan = request.plan
    const [backend, probe] = await Promise.all([
      runPreparationStage('profile', () => dependencies.getBackend(), {
        signal: preparationSignal,
      }),
      runPreparationStage(
        'probe',
        (signal) => dependencies.probe(request.source.path, request.source.hash, signal),
        { signal: preparationSignal },
      ),
    ])
    const sourceVideo = selectedVideo(probe.streams, plan.videoStreamIndex)
    const { encoder, decoder, audioEncoder } = await runPreparationStage(
      'preflight',
      async (preparationSignal) => {
        let encoder: Awaited<ReturnType<typeof selectInitializedH264Encoder>> | undefined
        let decoder: VideoDecoderCandidate | undefined
        let audioEncoder: AacEncoder | undefined
        if (plan.audio) {
          try {
            audioEncoder = await selectInitializedAacEncoder(
              dependencies.platform,
              backend.runtime.capabilities.encoders,
              (candidate) =>
                backend.scheduler.schedule({
                  signal: preparationSignal,
                  kind: 'playback',
                  weight: 'light',
                  run: (signal) =>
                    backend.executor
                      .run({
                        executable: backend.runtime.paths.ffmpeg,
                        arguments: createAacEncoderInitializationArguments(candidate),
                        inputs: [],
                        signal,
                      })
                      .then(() => undefined),
                }),
              request.decision?.audio?.action === 'transcode'
                ? request.decision.audio.encoderMode
                : 'auto',
            )
          } catch (cause) {
            throw new MediaPipelineError(
              toMediaCompatError(cause, {
                code: 'encoder-check-failed',
                stage: 'encoder-check',
                message: '没有可初始化的 AAC encoder',
                recoverable: true,
                profile: plan.kind,
                attemptChain: request.attemptChain ?? [plan.kind],
              }),
            )
          }
        }
        if (plan.kind === 'safe-h264-aac-sdr' || plan.kind === 'hdr-to-sdr-h264-aac') {
          if (!sourceVideo) throw new Error('视频兼容管线缺少源视频事实')
          const softwareDecoder = createSoftwareVideoDecoderCandidate(
            sourceVideo.codecName,
            backend.runtime.capabilities.decoders,
          )
          const hardwareDecoders = createHardwareVideoDecoderCandidates(
            dependencies.platform,
            sourceVideo.codecName,
            backend.runtime.capabilities.hwaccels,
          )
          try {
            decoder = await selectInitializedVideoDecoder({
              mode:
                request.decision?.video.action === 'transcode'
                  ? (request.decision.video.decoderMode ?? 'auto')
                  : 'auto',
              software: softwareDecoder,
              hardware: hardwareDecoders,
              initialize: (candidate) =>
                backend.scheduler.schedule({
                  signal: preparationSignal,
                  kind: 'playback',
                  weight: 'heavy',
                  run: (signal) =>
                    verifyVideoDecoderCandidate({
                      ffmpeg: backend.runtime.paths.ffmpeg,
                      executor: backend.executor,
                      inputPath: request.source.path,
                      videoStreamIndex: plan.videoStreamIndex,
                      candidate,
                      startTime: request.startTime,
                      signal,
                    }),
                }),
            })
          } catch (cause) {
            throw new MediaPipelineError(
              toMediaCompatError(cause, {
                code: 'pipeline-preflight-failed',
                stage: 'pipeline-preflight',
                message: '没有可初始化的输入视频 decoder',
                recoverable: true,
                profile: plan.kind,
                attemptChain: request.attemptChain ?? [plan.kind],
              }),
            )
          }
          let initializedEncoder: Awaited<ReturnType<typeof selectInitializedH264Encoder>>
          try {
            initializedEncoder = await selectInitializedH264Encoder(
              dependencies.platform,
              backend.runtime.capabilities.encoders,
              (candidate) =>
                backend.scheduler.schedule({
                  signal: preparationSignal,
                  kind: 'playback',
                  weight: 'heavy',
                  run: (signal) =>
                    backend.executor
                      .run({
                        executable: backend.runtime.paths.ffmpeg,
                        arguments: createH264EncoderInitializationArguments({
                          encoder: candidate,
                        }),
                        inputs: [],
                        signal,
                      })
                      .then(() => undefined),
                }),
              request.decision?.video.action === 'transcode'
                ? request.decision.video.encoderMode
                : 'auto',
            )
          } catch (cause) {
            throw new MediaPipelineError(
              toMediaCompatError(cause, {
                code: 'encoder-check-failed',
                stage: 'encoder-check',
                message: '没有可初始化的 H.264 编码器',
                recoverable: true,
                profile: plan.kind,
                attemptChain: request.attemptChain ?? [plan.kind],
              }),
            )
          }
          encoder = initializedEncoder
          try {
            await backend.scheduler.schedule({
              signal: preparationSignal,
              kind: 'playback',
              weight: 'heavy',
              run: (signal) =>
                backend.executor
                  .run({
                    executable: backend.runtime.paths.ffmpeg,
                    arguments: createH264PipelinePreflightArguments({
                      inputPath: request.source.path,
                      plan: legacyVideoPlan(plan),
                      encoder: initializedEncoder,
                      sourceVideo,
                      startTime: request.startTime,
                      audioEncoder,
                      decoderInputArguments: decoder!.inputArguments,
                    }),
                    inputs: [request.source.path],
                    signal,
                  })
                  .then(() => undefined),
            })
          } catch (cause) {
            throw new MediaPipelineError(
              toMediaCompatError(cause, {
                code: 'pipeline-preflight-failed',
                stage: 'pipeline-preflight',
                message: '真实媒体 pipeline 预检失败',
                recoverable: true,
                profile: plan.kind,
                attemptChain: request.attemptChain ?? [plan.kind],
              }),
            )
          }
        }

        return { encoder, decoder, audioEncoder }
      },
      { signal: preparationSignal },
    )

    const createInput = (input: SeekableGenerationFactoryInput) => ({
      executable: backend.runtime.paths.ffmpeg,
      ffprobe: backend.runtime.paths.ffprobe,
      plan,
      sourcePath: request.source.path,
      sourceVideo,
      encoder,
      audioEncoder,
      decoder,
      sessionId: registration.id,
      logicalSourceId: request.source.hash,
      token: registration.token,
      generation: input.generation,
      gatewayUrl,
      originalDuration: probe.duration,
      originalStartTime: probe.startTime,
      requestedStartTime: input.requestedStartTime,
      registry,
      executor: backend.executor,
      scheduler: backend.scheduler,
      attemptChain: request.attemptChain ?? [plan.kind],
      attemptMethods: request.attemptMethods,
      decision: request.decision,
    })

    return new SeekableTranscodeSession({
      sessionId: registration.id,
      logicalSourceId: request.source.hash,
      mode: modeForProfile(plan),
      originalStartTime: probe.startTime,
      initialStartTime: request.startTime,
      createGeneration: (input) =>
        new TranscodeSession({
          id: registration.id,
          logicalSourceId: request.source.hash,
          mode: modeForProfile(plan),
          profile: plan.kind,
          attemptChain: request.attemptChain ?? [plan.kind],
          attemptMethods: request.attemptMethods,
          decision: request.decision,
          generation: input.generation,
          originalStartTime: input.originalStartTime,
          requestedStartTime: input.requestedStartTime,
          cacheManager: backend.cacheManager,
          encoderClass:
            plan.kind === 'copy-video-aac'
              ? 'copy'
              : encoder === 'libx264'
                ? 'software'
                : 'hardware',
          runtime: {
            videoDecoder: decoder
              ? { name: decoder.name, class: decoder.class }
              : plan.kind === 'copy-video-aac'
                ? { name: 'copy', class: 'copy' }
                : undefined,
            videoEncoder:
              plan.kind === 'copy-video-aac'
                ? { name: 'copy', class: 'copy' }
                : {
                    name: encoder!,
                    class: encoder === 'libx264' ? 'software' : 'hardware',
                  },
            audioEncoder: audioEncoder
              ? { name: audioEncoder, class: aacEncoderClass(audioEncoder) }
              : undefined,
          },
          audioOutput: plan.audio
            ? {
                channels: plan.audio.channels,
                sampleRate: plan.audio.sampleRate,
                bitRate: 192_000,
              }
            : undefined,
        }),
      createProducer: (input) => createScheduledProducer(createInput(input)),
    })
  }
