import type { MediaProcessorChoice, VideoDecoderMode } from '@marchen/shared/media'
import type { FfmpegExecutionOptions, FfmpegExecutionResult } from './executor'
import { decoderCandidatesForCodec } from './codec-catalog'

export interface VideoDecoderCandidate extends MediaProcessorChoice {
  inputArguments: readonly string[]
}

export class VideoDecoderSelectionError extends AggregateError {
  constructor(
    readonly mode: VideoDecoderMode,
    readonly attempted: readonly string[],
    failures: readonly unknown[],
  ) {
    super(failures, `没有可初始化的 ${mode} 视频 decoder`)
    this.name = 'VideoDecoderSelectionError'
  }
}

export const createSoftwareVideoDecoderCandidate = (
  codecName: string,
  availableDecoders: ReadonlySet<string>,
): VideoDecoderCandidate | undefined => {
  const decoder = decoderCandidatesForCodec(codecName).find((name) => availableDecoders.has(name))
  return decoder
    ? {
        name: decoder,
        class: 'software',
        inputArguments: ['-hwaccel', 'none', '-c:v', decoder],
      }
    : undefined
}

const WINDOWS_HWACCEL_CODECS: Record<string, readonly string[]> = {
  d3d11va: ['h264', 'hevc', 'vp9', 'av1', 'vc1', 'wmv3', 'mpeg2video'],
  qsv: ['h264', 'hevc', 'vp9', 'av1', 'mpeg2video'],
  dxva2: ['h264', 'hevc', 'vp9', 'vc1', 'wmv3', 'mpeg2video'],
}

/** 候选仍必须经过 verifyVideoDecoderCandidate；列入顺序不等于当前 GPU 支持该文件。 */
export const createHardwareVideoDecoderCandidates = (
  platform: NodeJS.Platform,
  codecName: string,
  availableHwaccels: ReadonlySet<string>,
): VideoDecoderCandidate[] => {
  const codec = codecName.toLowerCase()
  if (platform === 'darwin') {
    // 本变更 spike 已用两个 HEVC Main10 长片验证；其他 codec 未验证前不进入 auto。
    return codec === 'hevc' && availableHwaccels.has('videotoolbox')
      ? [
          {
            name: 'hevc_videotoolbox',
            class: 'hardware',
            inputArguments: ['-hwaccel', 'videotoolbox'],
          },
        ]
      : []
  }
  if (platform === 'win32') {
    return ['d3d11va', 'qsv', 'dxva2'].flatMap((method) =>
      availableHwaccels.has(method) && WINDOWS_HWACCEL_CODECS[method]?.includes(codec)
        ? [
            {
              name: `${codec}_${method}`,
              class: 'hardware' as const,
              inputArguments: ['-hwaccel', method],
            },
          ]
        : [],
    )
  }
  return []
}

export const selectInitializedVideoDecoder = async (options: {
  mode: VideoDecoderMode
  software?: VideoDecoderCandidate
  hardware: readonly VideoDecoderCandidate[]
  initialize: (candidate: VideoDecoderCandidate) => Promise<void>
}): Promise<VideoDecoderCandidate> => {
  const candidates =
    options.mode === 'software'
      ? options.software
        ? [options.software]
        : []
      : options.mode === 'hardware'
        ? [...options.hardware]
        : [...options.hardware, ...(options.software ? [options.software] : [])]
  const failures: unknown[] = []
  const attempted: string[] = []
  for (const candidate of candidates) {
    attempted.push(candidate.name)
    try {
      await options.initialize(candidate)
      return candidate
    } catch (error) {
      failures.push(error)
    }
  }
  throw new VideoDecoderSelectionError(options.mode, attempted, failures)
}

interface DecoderProbeExecutor {
  run: (options: FfmpegExecutionOptions) => Promise<FfmpegExecutionResult>
}

/** 用真实输入解码一帧，能力目录与空输入初始化都不能替代这一步。 */
export const verifyVideoDecoderCandidate = async (options: {
  ffmpeg: string
  executor: DecoderProbeExecutor
  inputPath: string
  videoStreamIndex: number
  candidate: VideoDecoderCandidate
  startTime?: number
  signal?: AbortSignal
  timeoutMs?: number
}): Promise<void> => {
  await options.executor.run({
    executable: options.ffmpeg,
    arguments: [
      '-hide_banner',
      '-loglevel',
      'warning',
      '-nostdin',
      ...options.candidate.inputArguments,
      ...(options.startTime && options.startTime > 0 ? ['-ss', String(options.startTime)] : []),
      '-i',
      options.inputPath,
      '-map',
      `0:${options.videoStreamIndex}`,
      '-frames:v',
      '1',
      '-an',
      '-f',
      'null',
      '-',
    ],
    inputs: [options.inputPath],
    allowedInputProtocols: ['file'],
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? 5_000,
    stderrLimitBytes: 16 * 1024,
    stdoutLimitBytes: 0,
  })
}
