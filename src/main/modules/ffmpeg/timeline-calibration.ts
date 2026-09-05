import type { PlaybackTimelineDescriptor } from '@marchen/shared/media'
import type { FfmpegExecutionOptions, FfmpegExecutionResult } from './executor'
import { randomUUID } from 'node:crypto'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export interface GenerationTimelineCalibrationInput {
  originalDuration: number
  originalStartTime: number
  requestedStartTime: number
  actualFirstOutputTimestamp?: number
}

export interface GenerationTimelineCalibration {
  timeline: PlaybackTimelineDescriptor
  originalStartTime: number
  requestedStartTime: number
  actualFirstOutputTimestamp?: number
}

/**
 * HLS preset 使用 copyts + start_at_zero，ffprobe 读到的首 PTS 是相对原媒体逻辑
 * 起点的绝对时间，不是相对 requestedStartTime 的局部偏移。视频 copy 在
 * 长 GOP seek 时会从目标之前的关键帧开始；若再加一次 requestedStartTime，
 * 60s seek + 57.292s 首 PTS 会被误映射为 117.292s。
 */
export const calibrateGenerationTimeline = (
  input: GenerationTimelineCalibrationInput,
): GenerationTimelineCalibration => {
  const requestedStartTime = Math.max(0, input.requestedStartTime)
  const first = input.actualFirstOutputTimestamp
  const calibrated = first !== undefined && Number.isFinite(first)
  return {
    originalStartTime: input.originalStartTime,
    requestedStartTime,
    actualFirstOutputTimestamp: calibrated ? first : undefined,
    timeline: {
      originalDuration: Math.max(0, input.originalDuration),
      offset: Math.max(0, calibrated ? first : requestedStartTime),
      calibrated,
    },
  }
}

interface TimestampProbeExecutor {
  run: (options: FfmpegExecutionOptions) => Promise<FfmpegExecutionResult>
}

export const probeFirstOutputTimestamp = async (options: {
  ffprobe: string
  manifestPath: string
  executor: TimestampProbeExecutor
  signal?: AbortSignal
}): Promise<number> => {
  const manifest = await readFile(options.manifestPath, 'utf8')
  const complete = manifest.includes('#EXT-X-ENDLIST')
  // EVENT 清单未结束时，ffprobe 会持续等待后续 segment，导致首播直到整部视频
  // 转换完成才拿到 lease。写一个仅供探测的有限快照，让它读取当前完整分片后退出。
  const probeManifestPath = complete
    ? options.manifestPath
    : join(dirname(options.manifestPath), `timeline-probe-${randomUUID()}.m3u8`)
  if (!complete) await writeFile(probeManifestPath, `${manifest.trimEnd()}\n#EXT-X-ENDLIST\n`)

  let result: FfmpegExecutionResult
  try {
    result = await options.executor.run({
      executable: options.ffprobe,
      arguments: [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-read_intervals',
        '%+2',
        '-show_entries',
        'packet=pts_time,dts_time',
        '-of',
        'json',
        probeManifestPath,
      ],
      inputs: [probeManifestPath],
      kind: 'probe',
      signal: options.signal,
    })
  } finally {
    if (!complete) await unlink(probeManifestPath).catch(() => undefined)
  }
  const value = JSON.parse(result.stdout.toString('utf8')) as {
    packets?: Array<{ pts_time?: string; dts_time?: string }>
  }
  for (const packet of value.packets ?? []) {
    const timestamp = Number(packet.pts_time ?? packet.dts_time)
    if (Number.isFinite(timestamp)) return timestamp
  }
  throw new Error('无法读取 generation 首个视频输出 PTS')
}
