import type { MediaCompatError, MediaVideoStream, OutputProfile } from '@marchen/shared/media'
import type { FfmpegProcessExecutor } from '../ffmpeg/executor'

import { lstat } from 'node:fs/promises'

interface ProbeStream {
  index: number
  codec_type: 'video' | 'audio' | string
  codec_name?: string
  pix_fmt?: string
  start_time?: string
}

interface ProbePacket {
  stream_index: number
  pts_time?: string
  dts_time?: string
  flags?: string
}

interface ProbeOutput {
  streams?: ProbeStream[]
  packets?: ProbePacket[]
}

export interface ProducerValidationInput {
  ffprobe: string
  executor: Pick<FfmpegProcessExecutor, 'run'>
  manifestPath: string
  initPath: string
  firstSegmentPath: string
  profile: Exclude<OutputProfile, { kind: 'native' }>
  sourceVideo?: MediaVideoStream
  signal?: AbortSignal
}

export class ProducerValidationError extends Error {
  readonly detail: MediaCompatError

  constructor(message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'ProducerValidationError'
    this.detail = {
      code: 'manifest-invalid',
      stage: 'manifest-validation',
      message,
      recoverable: true,
      cause:
        cause instanceof Error ? cause.message : cause === undefined ? undefined : String(cause),
    }
  }
}

const finiteTimestamp = (packet: ProbePacket): boolean =>
  [packet.pts_time, packet.dts_time].some((value) => Number.isFinite(Number(value)))

const assertNonEmptyRegularFile = async (path: string, label: string): Promise<void> => {
  const statistics = await lstat(path)
  if (!statistics.isFile() || statistics.isSymbolicLink() || statistics.size <= 0) {
    throw new ProducerValidationError(`${label} 不是完整的普通文件`)
  }
}

/**
 * 对 Gateway 即将发布的首个 generation 做媒体级验证。ffprobe 读取本地 HLS 清单，
 * 因而会同时解析 init 与首段；只有 codec、时间戳和首视频关键帧全部成立才允许 ready。
 */
export const validateHlsProducerOutput = async (input: ProducerValidationInput): Promise<void> => {
  try {
    await Promise.all([
      assertNonEmptyRegularFile(input.manifestPath, 'HLS manifest'),
      assertNonEmptyRegularFile(input.initPath, 'HLS init segment'),
      assertNonEmptyRegularFile(input.firstSegmentPath, 'HLS 首段'),
    ])
    const result = await input.executor.run({
      executable: input.ffprobe,
      arguments: [
        '-v',
        'error',
        '-read_intervals',
        '%+3',
        '-show_streams',
        '-show_packets',
        '-show_entries',
        'stream=index,codec_type,codec_name,pix_fmt,start_time:packet=stream_index,pts_time,dts_time,flags',
        '-of',
        'json',
        input.manifestPath,
      ],
      inputs: [input.manifestPath],
      signal: input.signal,
      kind: 'probe',
    })
    const output = JSON.parse(result.stdout.toString('utf8')) as ProbeOutput
    const streams = output.streams ?? []
    const video = streams.find((stream) => stream.codec_type === 'video')
    const audio = streams.find((stream) => stream.codec_type === 'audio')
    if (!video) throw new ProducerValidationError('HLS 输出缺少可解析的视频轨道')

    const expectedVideoCodec =
      input.profile.kind === 'copy-video-aac' ? input.sourceVideo?.codecName : 'h264'
    if (!expectedVideoCodec || video.codec_name !== expectedVideoCodec) {
      throw new ProducerValidationError(
        `HLS 视频 codec 不符合档位：期望 ${expectedVideoCodec ?? '已知源 codec'}，实际 ${video.codec_name ?? 'unknown'}`,
      )
    }
    if (input.profile.kind !== 'copy-video-aac' && video.pix_fmt !== 'yuv420p') {
      throw new ProducerValidationError(
        `安全档位必须输出 yuv420p，实际 ${video.pix_fmt ?? 'unknown'}`,
      )
    }
    if (input.profile.audio && audio?.codec_name !== 'aac') {
      throw new ProducerValidationError(
        `HLS 音频 codec 不符合档位：期望 aac，实际 ${audio?.codec_name ?? 'missing'}`,
      )
    }

    const packets = output.packets ?? []
    const firstVideoPacket = packets.find((packet) => packet.stream_index === video.index)
    if (!firstVideoPacket || !finiteTimestamp(firstVideoPacket)) {
      throw new ProducerValidationError('HLS 首个视频包缺少有效 PTS/DTS')
    }
    if (!firstVideoPacket.flags?.includes('K')) {
      throw new ProducerValidationError('HLS 首段没有从独立视频关键帧开始')
    }
  } catch (error) {
    if (error instanceof ProducerValidationError) throw error
    throw new ProducerValidationError('HLS Producer Validator 执行失败', error)
  }
}
