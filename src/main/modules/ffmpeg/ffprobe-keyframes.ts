import type { FfmpegExecutionOptions, FfmpegExecutionResult } from './executor'
import type { FfmpegTaskScheduler } from './scheduler'

export interface FfprobeKeyframeData {
  sourceStartTime: number
  duration: number
  durationReliable: boolean
  keyframes: number[]
}

interface KeyframeProbeOutput {
  streams?: Array<{ start_time?: string; duration?: string }>
  format?: { start_time?: string; duration?: string }
  packets?: Array<{ pts_time?: string; flags?: string }>
}

interface KeyframeProbeExecutor {
  run: (options: FfmpegExecutionOptions) => Promise<FfmpegExecutionResult>
}

const finite = (value: string | undefined): number | undefined => {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

export const extractKeyframesWithFfprobe = (options: {
  ffprobe: string
  executor: KeyframeProbeExecutor
  scheduler: Pick<FfmpegTaskScheduler, 'schedule'>
  inputPath: string
  videoStreamIndex: number
  signal?: AbortSignal
  timeoutMs?: number
  stdoutLimitBytes?: number
}): Promise<FfprobeKeyframeData> =>
  options.scheduler.schedule({
    kind: 'keyframe',
    weight: 'light',
    signal: options.signal,
    run: async (signal) => {
      const result = await options.executor.run({
        executable: options.ffprobe,
        arguments: [
          '-fflags',
          '+genpts',
          '-v',
          'error',
          '-skip_frame',
          'nokey',
          '-select_streams',
          String(options.videoStreamIndex),
          '-show_packets',
          '-show_entries',
          'packet=pts_time,flags:stream=start_time,duration:format=start_time,duration',
          '-of',
          'json',
          options.inputPath,
        ],
        inputs: [options.inputPath],
        allowedInputProtocols: ['file'],
        signal,
        timeoutMs: options.timeoutMs ?? 8_000,
        stdoutLimitBytes: options.stdoutLimitBytes ?? 8 * 1024 * 1024,
        stderrLimitBytes: 16 * 1024,
        kind: 'probe',
      })
      const output = JSON.parse(result.stdout.toString('utf8')) as KeyframeProbeOutput
      const packets = (output.packets ?? [])
        .map((packet) => ({ pts: finite(packet.pts_time), keyframe: packet.flags?.includes('K') }))
        .filter((packet): packet is { pts: number; keyframe: boolean | undefined } =>
          Number.isFinite(packet.pts),
        )
        .sort((left, right) => left.pts - right.pts)
      const sourceKeyframes = packets
        .filter((packet) => packet.keyframe)
        .map((packet) => packet.pts)
        .filter((value): value is number => value !== undefined)
        .filter((value, index, values) => index === 0 || value > values[index - 1]!)
      if (sourceKeyframes.length === 0) throw new Error('ffprobe 没有返回视频关键帧')
      const stream = output.streams?.[0]
      const startCandidates = [
        packets[0]?.pts,
        finite(stream?.start_time),
        finite(output.format?.start_time),
      ].filter((value): value is number => value !== undefined)
      const sourceStartTime = Math.min(...startCandidates)
      const keyframes = sourceKeyframes.map((value) => Math.max(0, value - sourceStartTime))
      const streamDuration = finite(stream?.duration)
      const formatDuration = finite(output.format?.duration)
      const lastPacketPts = packets.at(-1)!.pts
      const reportedDuration = streamDuration ?? formatDuration
      const reportedSpan =
        reportedDuration === undefined
          ? undefined
          : sourceStartTime > 0 && reportedDuration >= lastPacketPts - 0.01
            ? reportedDuration - sourceStartTime
            : reportedDuration
      const duration = Math.max(0, reportedSpan ?? Math.max(0, lastPacketPts - sourceStartTime))
      const trailingDuration = duration - keyframes.at(-1)!
      return {
        sourceStartTime,
        duration,
        durationReliable: duration > 0 && trailingDuration <= 30,
        keyframes,
      }
    },
  })
