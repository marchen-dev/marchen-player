import type {
  MediaVideoStream,
  RemuxPlaybackPlan,
  TranscodeAudioPlaybackPlan,
  TranscodeVideoPlaybackPlan,
} from '@marchen/shared/media'

import { join } from 'node:path'

export interface HlsOutputLayout {
  directory: string
  manifestPath: string
  initPath: string
  segmentPattern: string
}

export interface FfmpegHlsPreset {
  arguments: string[]
  inputs: string[]
  output: HlsOutputLayout
}

export interface RemuxHlsPresetOptions {
  inputPath: string
  outputDirectory: string
  plan: RemuxPlaybackPlan
  sourceVideo?: MediaVideoStream
  startTime?: number
  segmentDuration?: number
}

export interface TranscodeAudioHlsPresetOptions {
  inputPath: string
  outputDirectory: string
  plan: TranscodeAudioPlaybackPlan
  sourceVideo?: MediaVideoStream
  startTime?: number
  segmentDuration?: number
}

export type H264Encoder = 'h264_videotoolbox' | 'h264_amf' | 'h264_nvenc' | 'h264_qsv' | 'libx264'

export interface TranscodeVideoHlsPresetOptions {
  inputPath: string
  outputDirectory: string
  plan: TranscodeVideoPlaybackPlan
  encoder: H264Encoder
  startTime?: number
  segmentDuration?: number
  sourceVideo?: MediaVideoStream
  videoFilter?: string
}

export const createHlsOutputLayout = (directory: string): HlsOutputLayout => ({
  directory,
  manifestPath: join(directory, 'index.m3u8'),
  initPath: join(directory, 'init.mp4'),
  segmentPattern: join(directory, 'segment-%05d.m4s'),
})

const hlsOutputArguments = (output: HlsOutputLayout, segmentDuration: number): string[] => [
  '-sn',
  '-dn',
  '-f',
  'hls',
  '-hls_time',
  String(segmentDuration),
  '-hls_list_size',
  '0',
  '-hls_playlist_type',
  'event',
  '-hls_segment_type',
  'fmp4',
  // FFmpeg 先写 .tmp 再在同目录 rename；Gateway 只会登记 rename 后的完整文件。
  '-hls_flags',
  'independent_segments+temp_file',
  '-hls_fmp4_init_filename',
  'init.mp4',
  '-hls_segment_filename',
  output.segmentPattern,
  '-y',
  output.manifestPath,
]

const inputArguments = (
  inputPath: string,
  startTime: number,
  extraInputArguments: string[] = [],
  reportProgress = true,
): string[] => [
  '-hide_banner',
  '-loglevel',
  'warning',
  '-nostdin',
  ...(reportProgress ? ['-progress', 'pipe:3', '-nostats'] : []),
  // start_at_zero 让各 generation 的输出时间线从零附近开始，实际首 PTS 再用于校准。
  '-copyts',
  '-start_at_zero',
  ...(startTime > 0 ? ['-ss', String(startTime)] : []),
  ...extraInputArguments,
  '-i',
  inputPath,
]

/**
 * Chromium 在 macOS 上接受的 HEVC MSE sample entry 是 hvc1。MKV 中的 HEVC
 * 没有 MP4 codec tag，FFmpeg 默认会写成 hev1，虽然数据无需重编码，但 HLS.js
 * 无法据此创建 SourceBuffer，因此所有复制 HEVC 的 fMP4 输出都显式规范为 hvc1。
 */
const copiedVideoCodecTagArguments = (source?: MediaVideoStream): string[] =>
  source?.codecName === 'hevc'
    ? [
        // 部分 DASH→MKV 文件把 VPS/SPS/PPS 只放在视频包内，codec private 中没有
        // 可供 MP4 muxer 使用的参数集。先转 Annex B 再提取 extradata，才能生成
        // 带完整 profile 的 hvcC；单独设置 hvc1 只会得到无法创建 SourceBuffer 的空壳。
        '-bsf:v',
        'hevc_mp4toannexb,extract_extradata',
        '-tag:v',
        'hvc1',
      ]
    : []

/** 仅重新封装，所有轨道都使用 ffprobe 的全局 stream index 显式 map。 */
export const createRemuxHlsPreset = (options: RemuxHlsPresetOptions): FfmpegHlsPreset => {
  const output = createHlsOutputLayout(options.outputDirectory)
  const startTime = Math.max(0, options.startTime ?? 0)
  const segmentDuration = Math.max(0.5, options.segmentDuration ?? 2)
  const arguments_ = [
    ...inputArguments(options.inputPath, startTime),
    '-map',
    `0:${options.plan.videoStreamIndex}`,
    ...(options.plan.audioStreamIndex === undefined
      ? ['-an']
      : ['-map', `0:${options.plan.audioStreamIndex}`]),
    '-c:v',
    'copy',
    ...copiedVideoCodecTagArguments(options.sourceVideo),
    ...(options.plan.audioStreamIndex === undefined ? [] : ['-c:a', 'copy']),
    ...hlsOutputArguments(output, segmentDuration),
  ]
  return { arguments: arguments_, inputs: [options.inputPath], output }
}

/** 音频兼容预设不得重编码视频；输出固定为 AAC-LC 48 kHz 与 planner 决定的声道数。 */
export const createTranscodeAudioHlsPreset = (
  options: TranscodeAudioHlsPresetOptions,
): FfmpegHlsPreset => {
  const output = createHlsOutputLayout(options.outputDirectory)
  const startTime = Math.max(0, options.startTime ?? 0)
  const segmentDuration = Math.max(0.5, options.segmentDuration ?? 2)
  return {
    arguments: [
      ...inputArguments(options.inputPath, startTime),
      '-map',
      `0:${options.plan.videoStreamIndex}`,
      '-map',
      `0:${options.plan.audioStreamIndex}`,
      '-c:v',
      'copy',
      ...copiedVideoCodecTagArguments(options.sourceVideo),
      '-c:a',
      options.plan.audio.codec,
      '-profile:a',
      options.plan.audio.profile,
      '-ar',
      String(options.plan.audio.sampleRate),
      '-ac',
      String(options.plan.audio.channels),
      '-b:a',
      '192k',
      ...hlsOutputArguments(output, segmentDuration),
    ],
    inputs: [options.inputPath],
    output,
  }
}

const videoEncoderArguments = (encoder: H264Encoder): string[] => {
  switch (encoder) {
    case 'h264_videotoolbox':
      return ['-c:v', encoder, '-realtime', 'true', '-b:v', '8M']
    case 'h264_nvenc':
      return ['-c:v', encoder, '-preset', 'p4', '-b:v', '8M']
    case 'h264_qsv':
      return ['-c:v', encoder, '-preset', 'medium', '-b:v', '8M']
    case 'h264_amf':
      return ['-c:v', encoder, '-quality', 'balanced', '-b:v', '8M']
    case 'libx264':
      return ['-c:v', encoder, '-preset', 'veryfast', '-crf', '20']
  }
}

const compatibleAudioArguments = (plan: TranscodeVideoPlaybackPlan): string[] =>
  plan.audio === 'copy'
    ? ['-c:a', 'copy']
    : [
        '-c:a',
        plan.audio.codec,
        '-profile:a',
        plan.audio.profile,
        '-ar',
        String(plan.audio.sampleRate),
        '-ac',
        String(plan.audio.channels),
        '-b:a',
        '192k',
      ]

const colorMetadataArguments = (
  plan: TranscodeVideoPlaybackPlan,
  source?: MediaVideoStream,
): string[] => {
  if (plan.video.toneMapToSdr) {
    return [
      '-color_primaries',
      'bt709',
      '-color_trc',
      'bt709',
      '-colorspace',
      'bt709',
      '-color_range',
      'tv',
    ]
  }
  return [
    ...(source?.colorPrimaries ? ['-color_primaries', source.colorPrimaries] : []),
    ...(source?.colorTransfer ? ['-color_trc', source.colorTransfer] : []),
    ...(source?.colorSpace ? ['-colorspace', source.colorSpace] : []),
    ...(source?.colorRange ? ['-color_range', source.colorRange] : []),
  ]
}

const normalizedRatio = (value: string | undefined, invert: boolean): string | undefined => {
  const match = value?.match(/^(\d+)[/:](\d+)$/)
  if (!match || Number(match[1]) <= 0 || Number(match[2]) <= 0) return undefined
  return invert ? `${match[2]}/${match[1]}` : `${match[1]}/${match[2]}`
}

/** HDR 先在线性光域 tone-map，再明确转换为 BT.709 limited-range 8-bit SDR。 */
export const createVideoCompatibilityFilter = (
  plan: TranscodeVideoPlaybackPlan,
  source?: MediaVideoStream,
): string | undefined => {
  const filters: string[] = []
  if (plan.video.toneMapToSdr) {
    if (source?.dynamicRange !== 'hdr10' && source?.dynamicRange !== 'hlg') {
      throw new Error('HDR→SDR tone-map 需要明确的 HDR10 或 HLG 色彩事实')
    }
    filters.push(
      'zscale=transfer=linear:npl=100',
      'format=gbrpf32le',
      'tonemap=tonemap=hable:desat=0',
      'zscale=primaries=bt709:transfer=bt709:matrix=bt709:range=tv',
      'format=yuv420p',
    )
  }
  const rotated = Math.abs(source?.rotation ?? 0) % 180 === 90
  const sampleAspectRatio = normalizedRatio(source?.sampleAspectRatio, rotated)
  const displayAspectRatio = normalizedRatio(source?.displayAspectRatio, rotated)
  if (sampleAspectRatio) filters.push(`setsar=${sampleAspectRatio}`)
  if (displayAspectRatio) filters.push(`setdar=${displayAspectRatio}`)
  return filters.length > 0 ? filters.join(',') : undefined
}

export const createTranscodeVideoHlsPreset = (
  options: TranscodeVideoHlsPresetOptions,
): FfmpegHlsPreset => {
  const output = createHlsOutputLayout(options.outputDirectory)
  const startTime = Math.max(0, options.startTime ?? 0)
  const segmentDuration = Math.max(0.5, options.segmentDuration ?? 2)
  const videoFilter =
    options.videoFilter ?? createVideoCompatibilityFilter(options.plan, options.sourceVideo)
  return {
    arguments: [
      // 转码时将 display matrix 烘焙进像素，并把输出旋转标记归零，避免播放器二次旋转。
      ...inputArguments(options.inputPath, startTime, ['-autorotate']),
      '-map',
      `0:${options.plan.videoStreamIndex}`,
      ...(options.plan.audioStreamIndex === undefined
        ? ['-an']
        : ['-map', `0:${options.plan.audioStreamIndex}`]),
      ...videoEncoderArguments(options.encoder),
      ...(videoFilter ? ['-vf', videoFilter] : []),
      '-pix_fmt',
      'yuv420p',
      ...colorMetadataArguments(options.plan, options.sourceVideo),
      // 所有编码型分片都使用闭合 GOP；强制关键帧与分片边界对齐。
      '-flags',
      '+cgop',
      ...(options.encoder === 'libx264' ? ['-sc_threshold', '0'] : []),
      '-force_key_frames',
      `expr:gte(t,n_forced*${segmentDuration})`,
      '-metadata:s:v:0',
      'rotate=0',
      '-map_metadata',
      '0',
      ...(options.plan.audioStreamIndex === undefined
        ? []
        : compatibleAudioArguments(options.plan)),
      ...hlsOutputArguments(output, segmentDuration),
    ],
    inputs: [options.inputPath],
    output,
  }
}

const HARDWARE_ENCODERS: Partial<Record<NodeJS.Platform, readonly H264Encoder[]>> = {
  darwin: ['h264_videotoolbox'],
  win32: ['h264_nvenc', 'h264_qsv', 'h264_amf'],
}

/** 编码器出现在 `-encoders` 中不等于当前 GPU/驱动可初始化，因此必须实际试跑。 */
export const selectInitializedH264Encoder = async (
  platform: NodeJS.Platform,
  availableEncoders: ReadonlySet<string>,
  initialize: (encoder: H264Encoder) => Promise<void>,
): Promise<H264Encoder> => {
  const candidates = [
    ...(HARDWARE_ENCODERS[platform] ?? []).filter((encoder) => availableEncoders.has(encoder)),
    'libx264' as const,
  ]
  const failures: unknown[] = []
  for (const encoder of candidates) {
    if (!availableEncoders.has(encoder)) continue
    try {
      await initialize(encoder)
      return encoder
    } catch (error) {
      failures.push(error)
    }
  }
  throw new AggregateError(failures, '没有可初始化的 H.264 编码器')
}

export const createH264EncoderInitializationArguments = (options: {
  encoder: H264Encoder
}): string[] => [
  '-hide_banner',
  '-loglevel',
  'warning',
  '-nostdin',
  '-f',
  'lavfi',
  '-i',
  'color=c=black:size=64x64:rate=1:duration=1',
  '-frames:v',
  '1',
  ...videoEncoderArguments(options.encoder),
  '-pix_fmt',
  'yuv420p',
  '-an',
  '-f',
  'null',
  '-',
]

/** 编码器通过合成帧自检后，再用真实文件验证选流、解码、滤镜、音频与 fMP4 封装。 */
export const createH264PipelinePreflightArguments = (options: {
  inputPath: string
  plan: TranscodeVideoPlaybackPlan
  encoder: H264Encoder
  sourceVideo?: MediaVideoStream
  startTime?: number
}): string[] => {
  const videoFilter = createVideoCompatibilityFilter(options.plan, options.sourceVideo)
  return [
    ...inputArguments(
      options.inputPath,
      Math.max(0, options.startTime ?? 0),
      ['-autorotate'],
      false,
    ),
    '-map',
    `0:${options.plan.videoStreamIndex}`,
    ...(options.plan.audioStreamIndex === undefined
      ? ['-an']
      : ['-map', `0:${options.plan.audioStreamIndex}`]),
    ...videoEncoderArguments(options.encoder),
    ...(videoFilter ? ['-vf', videoFilter] : []),
    '-pix_fmt',
    'yuv420p',
    ...colorMetadataArguments(options.plan, options.sourceVideo),
    '-frames:v',
    '1',
    ...(options.plan.audioStreamIndex === undefined ? [] : compatibleAudioArguments(options.plan)),
    '-t',
    '0.25',
    '-f',
    'mp4',
    '-movflags',
    'frag_keyframe+empty_moov',
    'pipe:1',
  ]
}
