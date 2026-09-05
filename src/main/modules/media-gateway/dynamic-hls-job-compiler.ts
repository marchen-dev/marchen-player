import type { H264Encoder } from '../ffmpeg/hls-preset'
import type { AacEncoder } from '../ffmpeg/audio-encoder'
import type { MediaVideoStream } from '@marchen/shared/media'
import type { CompiledMediaPipeline } from '../ffmpeg/pipeline-compiler'
import type { HlsTimeline } from '@marchen/shared/media'
import type { VideoDecoderCandidate } from '../ffmpeg/video-decoder'
import {
  createRemuxHlsPreset,
  createTranscodeAudioHlsPreset,
  createTranscodeVideoHlsPreset,
} from '../ffmpeg/hls-preset'

export interface DynamicHlsJobPreset {
  gracefulStdin: true
  preset: ReturnType<
    | typeof createRemuxHlsPreset
    | typeof createTranscodeAudioHlsPreset
    | typeof createTranscodeVideoHlsPreset
  >
  requestedSegmentIndex: number
  requestedLogicalTime: number
  expectedSegmentName: string
}

export const compileDynamicHlsJob = (options: {
  pipeline: Exclude<CompiledMediaPipeline, { kind: 'direct' }>
  timeline: HlsTimeline
  segmentIndex: number
  inputPath: string
  outputDirectory: string
  sourceVideo?: MediaVideoStream
  videoEncoder?: H264Encoder
  audioEncoder?: AacEncoder
  decoder?: VideoDecoderCandidate
  /** 仅由已验证输入策略显式选择；默认不对所有媒体套用 Jellyfin 的偏移。 */
  seekOffsetSeconds?: number
  /** 保留 demux seek 的音频预卷，再按逻辑切点裁剪；仅用于视频 copy + 音频转码。 */
  audioPreroll?: boolean
}): DynamicHlsJobPreset => {
  const segment = options.timeline.segments[options.segmentIndex]
  if (!segment) throw new RangeError(`未知 Dynamic HLS segment：${options.segmentIndex}`)
  const seekOffset = options.seekOffsetSeconds ?? 0
  if (!Number.isFinite(seekOffset) || seekOffset < 0 || seekOffset >= segment.duration) {
    throw new RangeError('Dynamic HLS seek 偏移必须处于目标分片内')
  }
  const base = {
    inputPath: options.inputPath,
    outputDirectory: options.outputDirectory,
    startTime: segment.startTime > 0 ? segment.startTime + seekOffset : 0,
    segmentDuration: options.timeline.targetSegmentDuration,
    startNumber: segment.index,
  }
  const preset = (() => {
    switch (options.pipeline.kind) {
      case 'remux':
        return createRemuxHlsPreset({
          ...base,
          plan: options.pipeline.plan,
          sourceVideo: options.sourceVideo,
        })
      case 'audio-compatible':
        return createTranscodeAudioHlsPreset({
          ...base,
          plan: options.pipeline.plan,
          sourceVideo: options.sourceVideo,
          audioEncoder: options.audioEncoder,
        })
      case 'video-compatible':
      case 'hdr-compatible':
        if (!options.videoEncoder) throw new Error('Dynamic HLS 视频 Job 缺少 H.264 encoder')
        return createTranscodeVideoHlsPreset({
          ...base,
          plan: options.pipeline.plan,
          sourceVideo: options.sourceVideo,
          encoder: options.videoEncoder,
          audioEncoder: options.audioEncoder,
          decoderInputArguments: options.decoder?.inputArguments,
        })
    }
  })()
  // v2 跨 Job 复用 init，需要保留音频延迟和 fragment 时间戳；v1 preset 不受影响。
  const arguments_ = preset.arguments.filter((argument) => argument !== '-nostdin')
  if (
    (options.pipeline.kind === 'video-compatible' || options.pipeline.kind === 'hdr-compatible') &&
    options.pipeline.plan.audio === 'copy' &&
    options.pipeline.plan.audioStreamIndex !== undefined &&
    segment.startTime > 0
  ) {
    // 视频解码会丢弃 seek 前的帧；复制的音频也要丢弃这些包，不能保留上一 GOP 的声音。
    arguments_.splice(arguments_.indexOf('-c:a'), 0, '-copypriorss:a', '0')
  }
  if (options.audioPreroll && segment.startTime > 0) {
    if (options.pipeline.kind !== 'audio-compatible')
      throw new Error('音频预卷只适用于视频 copy + 音频转码')
    arguments_.splice(arguments_.indexOf('-i'), 0, '-noaccurate_seek')
    arguments_.splice(arguments_.indexOf('-c:a'), 0, '-af', `atrim=start=${segment.startTime}`)
  }
  const outputIndex = arguments_.findIndex(
    (argument, index) => argument === '-f' && arguments_[index + 1] === 'hls',
  )
  if (outputIndex < 0) throw new Error('Dynamic HLS preset 缺少 HLS 输出')
  arguments_.splice(
    outputIndex,
    0,
    '-avoid_negative_ts',
    'disabled',
    '-hls_segment_options',
    'movflags=+frag_discont+skip_sidx',
  )
  return {
    gracefulStdin: true,
    preset: { ...preset, arguments: arguments_ },
    requestedSegmentIndex: segment.index,
    requestedLogicalTime: segment.startTime,
    expectedSegmentName: `segment-${segment.index.toString().padStart(5, '0')}.m4s`,
  }
}

export const validateDynamicJobCoverage = (input: {
  timeline: HlsTimeline
  requestedSegmentIndex: number
  actualFirstPts: number
  producedSegmentIndices: readonly number[]
  ptsToleranceSeconds?: number
}): void => {
  const segment = input.timeline.segments[input.requestedSegmentIndex]
  if (!segment) throw new Error('Dynamic HLS coverage 请求 segment 不存在')
  if (!input.producedSegmentIndices.includes(input.requestedSegmentIndex)) {
    throw new Error('Dynamic HLS Job 没有产出请求 segment')
  }
  if (!Number.isFinite(input.actualFirstPts)) throw new Error('Dynamic HLS Job 首 PTS 无效')
  const tolerance = input.ptsToleranceSeconds ?? Math.max(1, input.timeline.targetSegmentDuration)
  if (Math.abs(input.actualFirstPts - segment.startTime) > tolerance) {
    throw new Error('Dynamic HLS Job 首 PTS 未覆盖请求时间')
  }
}
