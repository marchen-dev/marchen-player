import type { InitFingerprint, InitTrackFingerprint } from '@marchen/shared/media'
import type { FfmpegExecutionOptions, FfmpegExecutionResult } from './executor'

import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { INIT_FINGERPRINT_SCHEMA_VERSION } from '@marchen/shared/media'
import { deriveTargetCodecString } from './probe'

interface TargetProbeExecutor {
  run: (options: FfmpegExecutionOptions) => Promise<FfmpegExecutionResult>
}

interface TargetProbeStream {
  index?: number
  id?: string
  codec_name?: string
  codec_tag_string?: string
  profile?: string
  level?: number
  time_base?: string
  extradata?: string
  extradata_size?: number
  mime_codec_string?: string
  bits_per_raw_sample?: string
  pix_fmt?: string
}

export interface TargetInitProbeStream {
  outputIndex: number
  codecName: string
  codecString?: string
  sampleEntry?: string
  profile?: string
  level?: number
}

export interface TargetInitProbeResult {
  targetContainer: 'video/mp4'
  video?: TargetInitProbeStream
  audio?: TargetInitProbeStream
  fingerprint: InitFingerprint
}

export interface TargetInitProbeOptions {
  ffmpeg: string
  ffprobe: string
  executor: TargetProbeExecutor
  workRoot: string
  inputPath: string
  videoStreamIndex: number
  videoCodecName: string
  audioStreamIndex?: number
  signal?: AbortSignal
  durationSeconds?: number
  timeoutMs?: number
  maxOutputBytes?: number
}

const DEFAULT_DURATION_SECONDS = 1
const DEFAULT_TIMEOUT_MS = 5_000
const DEFAULT_MAX_OUTPUT_BYTES = 8 * 1024 * 1024
const STDERR_LIMIT_BYTES = 16 * 1024
const STDOUT_LIMIT_BYTES = 1024 * 1024

const copiedVideoArguments = (codecName: string): string[] =>
  codecName.toLowerCase() === 'hevc'
    ? ['-bsf:v', 'hevc_mp4toannexb,extract_extradata', '-tag:v', 'hvc1']
    : []

const normalizedExtradata = (value: string | undefined): string =>
  `${value ?? ''}`
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[0-9a-f]+:\s*/i, '').replace(/\s+/g, ''))
    .join('')

const hash = (value: string): string => createHash('sha256').update(value).digest('hex')

const fingerprintTrack = (stream: TargetProbeStream, order: number): InitTrackFingerprint => ({
  order,
  trackId: stream.id ?? String(stream.index ?? order),
  codec: stream.codec_name ?? 'unknown',
  sampleEntry: stream.codec_tag_string ?? 'unknown',
  profile: stream.profile,
  level: stream.level,
  timeBase: stream.time_base ?? 'unknown',
  extradataSize: stream.extradata_size ?? 0,
  extradataHash: hash(normalizedExtradata(stream.extradata)),
})

const publicStream = (stream: TargetProbeStream): TargetInitProbeStream => {
  const probedCodecString = stream.mime_codec_string
  return {
    outputIndex: stream.index ?? -1,
    codecName: stream.codec_name ?? 'unknown',
    codecString:
      probedCodecString ?? deriveTargetCodecString(stream as unknown as Record<string, unknown>),
    sampleEntry: stream.codec_tag_string,
    profile: stream.profile,
    level: stream.level,
  }
}

export const probeTargetInit = async (
  options: TargetInitProbeOptions,
): Promise<TargetInitProbeResult> => {
  const directory = join(options.workRoot, `target-probe-${randomUUID()}`)
  const outputPath = join(directory, 'target.mp4')
  await mkdir(directory, { recursive: false })
  try {
    await options.executor.run({
      executable: options.ffmpeg,
      arguments: [
        '-hide_banner',
        '-loglevel',
        'warning',
        '-nostdin',
        '-i',
        options.inputPath,
        '-t',
        String(Math.max(0.1, Math.min(options.durationSeconds ?? DEFAULT_DURATION_SECONDS, 3))),
        '-map',
        `0:${options.videoStreamIndex}`,
        ...(options.audioStreamIndex === undefined
          ? ['-an']
          : ['-map', `0:${options.audioStreamIndex}`]),
        '-c:v',
        'copy',
        ...copiedVideoArguments(options.videoCodecName),
        ...(options.audioStreamIndex === undefined ? [] : ['-c:a', 'copy']),
        '-f',
        'mp4',
        '-movflags',
        '+empty_moov+frag_keyframe+default_base_moof+skip_trailer',
        '-y',
        outputPath,
      ],
      inputs: [options.inputPath],
      allowedInputProtocols: ['file'],
      signal: options.signal,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      stderrLimitBytes: STDERR_LIMIT_BYTES,
      stdoutLimitBytes: 0,
    })

    const statistics = await lstat(outputPath)
    const maximum = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES
    if (!statistics.isFile() || statistics.isSymbolicLink() || statistics.size <= 0) {
      throw new Error('target init probe 没有生成完整普通文件')
    }
    if (statistics.size > maximum) {
      throw new Error(`target init probe 输出超过 ${maximum} 字节限制`)
    }

    const inspected = await options.executor.run({
      executable: options.ffprobe,
      arguments: [
        '-v',
        'error',
        '-show_streams',
        '-show_data',
        '-show_entries',
        'stream=index,id,codec_name,codec_tag_string,profile,level,time_base,extradata,extradata_size,mime_codec_string,bits_per_raw_sample,pix_fmt',
        '-of',
        'json',
        outputPath,
      ],
      inputs: [outputPath],
      allowedInputProtocols: ['file'],
      signal: options.signal,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      stderrLimitBytes: STDERR_LIMIT_BYTES,
      stdoutLimitBytes: STDOUT_LIMIT_BYTES,
      kind: 'probe',
    })
    const value = JSON.parse(inspected.stdout.toString('utf8')) as { streams?: TargetProbeStream[] }
    const streams = value.streams ?? []
    if (streams.length === 0) throw new Error('target init probe 无法读取输出轨道')
    const video = streams[0]
    const audio = options.audioStreamIndex === undefined ? undefined : streams[1]
    return {
      targetContainer: 'video/mp4',
      video: video ? publicStream(video) : undefined,
      audio: audio ? publicStream(audio) : undefined,
      fingerprint: {
        schemaVersion: INIT_FINGERPRINT_SCHEMA_VERSION,
        tracks: streams.map(fingerprintTrack),
      },
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
