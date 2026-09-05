import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { basename, resolve } from 'node:path'

const run = (command, arguments_) =>
  new Promise((resolve_, reject) => {
    const child = spawn(command, arguments_, { stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout = []
    const stderr = []
    child.stdout.on('data', (chunk) => stdout.push(chunk))
    child.stderr.on('data', (chunk) => stderr.push(chunk))
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      const error = Buffer.concat(stderr).toString('utf8')
      if (code === 0) resolve_(Buffer.concat(stdout).toString('utf8'))
      else reject(new Error(`${command} 退出 ${code ?? signal}\n${error.slice(-4000)}`))
    })
  })

const parseArguments = () => {
  const values = process.argv.slice(2).filter((value) => value !== '--')
  const bundledFfprobe = resolve(
    import.meta.dirname,
    '../..',
    'resources',
    'ffmpeg',
    `${process.platform}-${process.arch}`,
    process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe',
  )
  const options = {
    ffprobe: existsSync(bundledFfprobe) ? bundledFfprobe : 'ffprobe',
    targetSegmentSeconds: 6,
    files: [],
  }
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--ffprobe') options.ffprobe = resolve(values[++index])
    else if (values[index] === '--segment-seconds') {
      options.targetSegmentSeconds = Number(values[++index])
    } else options.files.push(resolve(values[index]))
  }
  if (!options.files.length) throw new Error('缺少媒体文件')
  if (!(options.targetSegmentSeconds > 0)) throw new Error('segment seconds 必须大于 0')
  return options
}

const finite = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

const percentile = (values, ratio) => {
  if (!values.length) return undefined
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor((sorted.length - 1) * ratio)]
}

const createSegments = (keyframes, duration, target) => {
  let lastBoundary = 0
  let desiredBoundary = target
  const durations = []
  for (const keyframe of keyframes) {
    if (keyframe + 0.000_001 < desiredBoundary) continue
    durations.push(keyframe - lastBoundary)
    lastBoundary = keyframe
    desiredBoundary += target
  }
  if (duration > lastBoundary) durations.push(duration - lastBoundary)
  return durations
}

const analyze = async (file, options) => {
  const started = process.hrtime.bigint()
  const source = await run(options.ffprobe, [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=start_time,duration,r_frame_rate,avg_frame_rate',
    '-show_entries',
    'format=start_time,duration',
    '-show_entries',
    'packet=pts_time,duration_time,flags',
    '-show_packets',
    '-of',
    'json',
    file,
  ])
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000
  const value = JSON.parse(source)
  const stream = value.streams?.[0] ?? {}
  const packets = (value.packets ?? [])
    .map((packet) => ({
      pts: finite(packet.pts_time),
      duration: finite(packet.duration_time) ?? 0,
      keyframe: `${packet.flags ?? ''}`.includes('K'),
    }))
    .filter((packet) => packet.pts !== undefined)
    .sort((left, right) => left.pts - right.pts)
  if (!packets.length) throw new Error(`${basename(file)} 没有可分析的视频 packet`)

  const sourceStart =
    finite(stream.start_time) ?? finite(value.format?.start_time) ?? packets[0].pts
  const lastPacket = packets.at(-1)
  const packetEnd = lastPacket.pts + lastPacket.duration
  const streamDuration = finite(stream.duration)
  const duration = streamDuration ?? Math.max(0, packetEnd - sourceStart)
  const keyframes = packets
    .filter((packet) => packet.keyframe)
    .map((packet) => Math.max(0, packet.pts - sourceStart))
  const packetDurations = packets.map((packet) => packet.duration).filter((value_) => value_ > 0)
  const distinctPacketDurations = [
    ...new Set(packetDurations.map((value_) => value_.toFixed(6))),
  ].map(Number)
  const packetTimestampDeltas = packets
    .slice(1)
    .map((packet, index) => packet.pts - packets[index].pts)
    .filter((value_) => value_ > 0)
  const distinctTimestampDeltas = [
    ...new Set(packetTimestampDeltas.map((value_) => value_.toFixed(6))),
  ].map(Number)
  const timestampDeltaSpread =
    distinctTimestampDeltas.length > 0
      ? Math.max(...distinctTimestampDeltas) - Math.min(...distinctTimestampDeltas)
      : 0
  const segments = createSegments(keyframes, duration, options.targetSegmentSeconds)

  return {
    file: basename(file),
    elapsedMs,
    sourceStartSeconds: sourceStart,
    durationSeconds: duration,
    durationSource: streamDuration === undefined ? 'last-video-packet' : 'video-stream',
    formatDurationSeconds: finite(value.format?.duration),
    packetCount: packets.length,
    keyframeCount: keyframes.length,
    firstKeyframeSeconds: keyframes[0],
    lastKeyframeSeconds: keyframes.at(-1),
    packetDurationDistinctSeconds: distinctPacketDurations,
    packetTimestampDeltaDistinctSeconds: distinctTimestampDeltas,
    variablePacketTiming: timestampDeltaSpread > 0.005,
    timeline: {
      targetSegmentSeconds: options.targetSegmentSeconds,
      segmentCount: segments.length,
      totalDurationSeconds: segments.reduce((total, value_) => total + value_, 0),
      minimumSegmentSeconds: Math.min(...segments),
      p95SegmentSeconds: percentile(segments, 0.95),
      maximumSegmentSeconds: Math.max(...segments),
      tailSegmentSeconds: segments.at(-1),
      monotonic: keyframes.every((value_, index) => index === 0 || value_ > keyframes[index - 1]),
    },
    reportedRates: {
      rFrameRate: stream.r_frame_rate,
      averageFrameRate: stream.avg_frame_rate,
    },
  }
}

const options = parseArguments()
const results = []
for (const file of options.files) results.push(await analyze(file, options))
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2))
