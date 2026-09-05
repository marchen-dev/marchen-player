import type { SegmentStoreEntrySnapshot } from '@marchen/shared/media'
import type { FfmpegProcessExecutor } from '../ffmpeg/executor'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export type SegmentMediaRange = NonNullable<SegmentStoreEntrySnapshot['actualRange']>

/** 用独立临时文件组合 init+fragment，不让特殊路径进入 concat 协议表达式。 */
export const inspectSegmentMedia = async (options: {
  ffprobe: string
  executor: FfmpegProcessExecutor
  initPath: string
  segmentPath: string
  signal?: AbortSignal
}): Promise<SegmentMediaRange> => {
  const directory = await mkdtemp(join(tmpdir(), 'marchen-segment-probe-'))
  try {
    const path = join(directory, 'media.mp4')
    async function* chunks() {
      for (const input of [options.initPath, options.segmentPath]) {
        yield* createReadStream(input)
      }
    }
    await pipeline(Readable.from(chunks()), createWriteStream(path), { signal: options.signal })
    const result = await options.executor.run({
      executable: options.ffprobe,
      arguments: [
        '-v',
        'error',
        '-show_packets',
        '-show_entries',
        'packet=codec_type,pts_time,duration_time',
        '-of',
        'json',
        path,
      ],
      inputs: [path],
      kind: 'probe',
      signal: options.signal,
      timeoutMs: 5_000,
      stdoutLimitBytes: 8 * 1024 * 1024,
    })
    const data = JSON.parse(result.stdout.toString('utf8')) as {
      packets?: Array<{ codec_type?: string; pts_time?: string; duration_time?: string }>
    }
    const track = (type: string) => {
      const packets = data.packets?.filter((packet) => packet.codec_type === type) ?? []
      if (!packets.length) return undefined
      let start = Infinity
      let end = -Infinity
      for (const packet of packets) {
        const pts = Number(packet.pts_time),
          duration = Number(packet.duration_time)
        if (!Number.isFinite(pts) || !Number.isFinite(duration) || duration <= 0)
          throw new Error('分片 packet 时间事实不完整')
        start = Math.min(start, pts)
        end = Math.max(end, pts + duration)
      }
      return { start, end }
    }
    const video = track('video')
    if (!video) throw new Error('分片缺少视频时间事实')
    return { video, audio: track('audio') }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
