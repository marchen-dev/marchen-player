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
 * HLS preset 用 copyts + start_at_zero 将 seek 点移到零附近；首包仍可能因关键帧、B 帧或
 * VFR 偏离零点，因此 generation offset 必须加入实际首 PTS，不能只复用请求 seek。
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
      offset: Math.max(0, requestedStartTime + (calibrated ? first : 0)),
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
