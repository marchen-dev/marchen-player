import type { CompatibleSessionFactory } from './compatible-session-factory'
import type { HlsTimeline, MediaVideoStream } from '@marchen/shared/media'
import type { MediaGatewayRegistry } from './registry'
import type { DynamicHlsRequestCoordinator } from './dynamic-hls-coordinator'
import type { VideoDecoderCandidate } from '../ffmpeg/video-decoder'
import {
  getFfmpegMediaTools,
  getFfmpegPlaybackBackend,
  getKeyframeMetadataCache,
} from '../ffmpeg/service'
import { createMediaSourceFingerprint } from '../ffmpeg/source-fingerprint'
import { extractMatroskaKeyframes } from '../ffmpeg/matroska-keyframes'
import { extractKeyframesWithFfprobe } from '../ffmpeg/ffprobe-keyframes'
import { compilePlaybackDecision } from '../ffmpeg/pipeline-compiler'
import { createSoftwareVideoDecoderCandidate } from '../ffmpeg/video-decoder'
import { createH264PipelinePreflightArguments } from '../ffmpeg/hls-preset'
import { resolveKeyframeTimeline } from './keyframe-timeline-resolver'
import { createClosedGopTimeline } from './hls-timeline'
import { createDynamicHlsCompatibleSession } from './dynamic-hls-compatible-session'
import { MediaPipelineError } from './errors'
import { runPreparationStage } from './preparation'

export const createDynamicHlsSessionFactory =
  (
    registry: MediaGatewayRegistry,
    coordinator: DynamicHlsRequestCoordinator,
    dependencies = {
      getBackend: getFfmpegPlaybackBackend,
      getTools: getFfmpegMediaTools,
      getKeyframeCache: getKeyframeMetadataCache,
    },
  ): CompatibleSessionFactory =>
  async (input) => {
    const decision = input.request.decision
    if (!decision) throw new Error('v2 需要 generalized PlaybackDecision')
    const pipeline = compilePlaybackDecision(decision)
    if (pipeline.kind === 'direct') throw new Error('Direct Play 不创建 Dynamic HLS')
    if (decision.audio?.action === 'transcode' && decision.audio.encoderMode === 'system')
      throw new MediaPipelineError({
        code: 'encoder-check-failed',
        stage: 'encoder-check',
        message: 'v2 系统音频 encoder 尚未验证；当前只开放软件 AAC',
        recoverable: false,
      })
    const [backend, tools, source] = await runPreparationStage(
      'profile',
      () =>
        Promise.all([
          dependencies.getBackend(),
          dependencies.getTools(),
          createMediaSourceFingerprint(input.request.source.path, input.request.source.hash),
        ]),
      { signal: input.signal },
    )
    const facts = await runPreparationStage(
      'probe',
      (signal) => tools.probe(input.request.source.path, input.request.source.hash, signal),
      { signal: input.signal },
    )
    const sourceVideo = facts.streams.find(
      (stream): stream is MediaVideoStream =>
        stream.type === 'video' && stream.index === pipeline.plan.videoStreamIndex,
    )
    if (!sourceVideo)
      throw new MediaPipelineError({
        code: 'unsupported-video',
        stage: 'planning',
        message: '没有可用视频轨道',
        recoverable: false,
      })
    let timeline: HlsTimeline
    let decoder: VideoDecoderCandidate | undefined
    let videoEncoder: 'libx264' | undefined
    if (pipeline.kind === 'video-compatible' || pipeline.kind === 'hdr-compatible') {
      if (decision.video.action !== 'transcode') throw new Error('视频决策与 compiler 不一致')
      if (decision.video.decoderMode === 'hardware' || decision.video.encoderMode === 'hardware')
        throw new MediaPipelineError({
          code: 'runtime-capability-missing',
          stage: 'pipeline-preflight',
          message: 'v2 硬件路径尚未验证；当前只开放软件基线',
          recoverable: false,
        })
      if (sourceVideo.dynamicRange === 'dolby-vision')
        throw new MediaPipelineError({
          code: 'video-range-not-supported',
          stage: 'planning',
          message: '当前软件基线不支持 Dolby Vision 转换',
          recoverable: false,
        })
      if (['hdr10', 'hlg'].includes(sourceVideo.dynamicRange) && pipeline.kind !== 'hdr-compatible')
        throw new MediaPipelineError({
          code: 'tone-map-unavailable',
          stage: 'planning',
          message: 'HDR 输入必须明确选择 tone-map，不能直接丢弃色彩信息',
          recoverable: false,
        })
      decoder = createSoftwareVideoDecoderCandidate(
        sourceVideo.codecName,
        backend.runtime.capabilities.decoders,
      )
      if (!decoder || !backend.runtime.capabilities.encoders.has('libx264'))
        throw new MediaPipelineError({
          code: 'runtime-capability-missing',
          stage: 'encoder-check',
          message: '缺少软件 decoder 或 libx264 encoder',
          recoverable: false,
        })
      videoEncoder = 'libx264'
      // 对非零起点优先使用轨道时长；容器时长语义不明确时明确退回旧 transport。
      const duration = sourceVideo.duration ?? (facts.startTime === 0 ? facts.duration : undefined)
      if (!duration || !Number.isFinite(duration))
        throw new MediaPipelineError({
          code: 'hls-timeline-unavailable',
          stage: 'metadata',
          message: '转码输入尚无可靠逻辑时长，使用旧 transport',
          recoverable: true,
        })
      timeline = createClosedGopTimeline({
        sourceStartTime: facts.startTime,
        duration,
        targetSegmentDuration: 2,
      })
      const softwareDecoder = decoder
      await runPreparationStage(
        'preflight',
        (signal) =>
          backend.scheduler.schedule({
            kind: 'playback',
            weight: 'heavy',
            signal,
            run: (child) =>
              backend.executor.run({
                executable: backend.runtime.paths.ffmpeg,
                arguments: createH264PipelinePreflightArguments({
                  inputPath: input.request.source.path,
                  plan: pipeline.plan,
                  encoder: 'libx264',
                  sourceVideo,
                  startTime: input.request.startTime,
                  decoderInputArguments: softwareDecoder.inputArguments,
                  audioEncoder: 'aac',
                }),
                inputs: [input.request.source.path],
                signal: child,
              }),
          }),
        { signal: input.signal },
      )
    } else {
      const resolution = await runPreparationStage(
        'keyframe',
        (signal) =>
          resolveKeyframeTimeline({
            source,
            inputPath: input.request.source.path,
            signal,
            targetSegmentDuration: 6,
            cache: dependencies.getKeyframeCache(),
            allowLegacyEventFallback: false,
            extractMatroska: extractMatroskaKeyframes,
            extractFfprobe: (child, timeoutMs) =>
              extractKeyframesWithFfprobe({
                ffprobe: backend.runtime.paths.ffprobe,
                executor: backend.executor,
                scheduler: backend.scheduler,
                inputPath: input.request.source.path,
                videoStreamIndex: pipeline.plan.videoStreamIndex,
                signal: child,
                timeoutMs,
              }),
          }),
        { signal: input.signal },
      )
      if (!resolution.ok)
        throw new MediaPipelineError({
          code: 'generation-failed',
          stage: 'planning',
          message: '无法建立可靠 Dynamic HLS 关键帧时间线',
          recoverable: true,
          compatibilityReason: resolution.reason,
        })
      timeline = resolution.timeline
    }
    return createDynamicHlsCompatibleSession({
      ...input,
      registry,
      coordinator,
      backend,
      pipeline,
      timeline,
      sourceVideo,
      decoder,
      videoEncoder,
    })
  }
