import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

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
  const options = { ffprobe: existsSync(bundledFfprobe) ? bundledFfprobe : 'ffprobe', files: [] }
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--ffprobe') options.ffprobe = resolve(values[++index])
    else options.files.push(resolve(values[index]))
  }
  const files = options.files
  if (files.length === 0) throw new Error('用法：benchmark-keyframes.mjs <file.mkv> [...]')
  return options
}

const run = (command, arguments_) =>
  new Promise((resolve_, reject) => {
    const child = spawn(command, arguments_, { stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout = []
    const stderr = []
    child.stdout.on('data', (chunk) => stdout.push(chunk))
    child.stderr.on('data', (chunk) => stderr.push(chunk))
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      const result = {
        code,
        signal,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      }
      if (code === 0) resolve_(result)
      else reject(new Error(`${command} 退出 ${code ?? signal}\n${result.stderr.slice(-4000)}`))
    })
  })

const runTimed = async (command, arguments_) => {
  const started = process.hrtime.bigint()
  const result =
    process.platform === 'darwin'
      ? await run('/usr/bin/time', ['-l', command, ...arguments_])
      : await run(command, arguments_)
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000
  const maximumResidentSetSize = result.stderr.match(/(\d+)\s+maximum resident set size/)
  return {
    ...result,
    elapsedMs,
    maximumResidentSetBytes: maximumResidentSetSize ? Number(maximumResidentSetSize[1]) : undefined,
  }
}

const timestampSeconds = (value) => {
  const match = value.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/)
  if (!match) return undefined
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
}

const parseCueTimestamps = (source) =>
  source
    .split(/\r?\n/)
    .map((line) => line.match(/(?:^|\s)timestamp=([^\s]+)/)?.[1])
    .map((value) => (value ? timestampSeconds(value) : undefined))
    .filter((value) => Number.isFinite(value))

const parseFfprobeCsv = (source) => {
  const keyframes = []
  let streamDuration
  let formatDuration
  for (const line of source.split(/\r?\n/)) {
    const [kind, value, flags] = line.split(',')
    if (kind === 'packet' && flags?.startsWith('K')) {
      const pts = Number(value)
      if (Number.isFinite(pts)) keyframes.push(pts)
    } else if (kind === 'stream') {
      const duration = Number(value)
      if (Number.isFinite(duration)) streamDuration = duration
    } else if (kind === 'format') {
      const duration = Number(value)
      if (Number.isFinite(duration)) formatDuration = duration
    }
  }
  return { keyframes, duration: streamDuration ?? formatDuration }
}

const compareTimestamps = (metadata, scanned) => {
  const toleranceSeconds = 0.002
  let metadataIndex = 0
  let scannedIndex = 0
  let matched = 0
  let metadataOnly = 0
  let scannedOnly = 0
  let maximumMatchedDeltaMs = 0
  while (metadataIndex < metadata.length && scannedIndex < scanned.length) {
    const delta = metadata[metadataIndex] - scanned[scannedIndex]
    if (Math.abs(delta) <= toleranceSeconds) {
      matched += 1
      maximumMatchedDeltaMs = Math.max(maximumMatchedDeltaMs, Math.abs(delta) * 1000)
      metadataIndex += 1
      scannedIndex += 1
    } else if (delta < 0) {
      metadataOnly += 1
      metadataIndex += 1
    } else {
      scannedOnly += 1
      scannedIndex += 1
    }
  }
  metadataOnly += metadata.length - metadataIndex
  scannedOnly += scanned.length - scannedIndex
  return {
    toleranceMs: toleranceSeconds * 1000,
    matched,
    metadataOnly,
    scannedOnly,
    maximumMatchedDeltaMs,
  }
}

const summarizeGaps = (timestamps, durationSeconds) => {
  const gaps = []
  for (let index = 1; index < timestamps.length; index += 1) {
    gaps.push(timestamps[index] - timestamps[index - 1])
  }
  const sorted = [...gaps].sort((left, right) => left - right)
  return {
    averageGapSeconds: gaps.length
      ? gaps.reduce((total, value) => total + value, 0) / gaps.length
      : undefined,
    p95GapSeconds: sorted.length ? sorted[Math.floor((sorted.length - 1) * 0.95)] : undefined,
    maximumGapSeconds: sorted.at(-1),
    trailingGapSeconds:
      timestamps.length && Number.isFinite(durationSeconds)
        ? Math.max(0, durationSeconds - timestamps.at(-1))
        : undefined,
  }
}

const benchmark = async (file, ffprobePath) => {
  const directory = await mkdtemp(join(tmpdir(), 'marchen-keyframe-spike-'))
  try {
    const identity = JSON.parse((await run('mkvmerge', ['-J', file])).stdout)
    const videoTrack = identity.tracks?.find((track) => track.type === 'video')
    if (!videoTrack) throw new Error('Matroska 文件缺少视频轨道')

    const cuePath = join(directory, 'cues.txt')
    const metadata = await runTimed('mkvextract', [file, 'cues', `${videoTrack.id}:${cuePath}`])
    const cueTimestamps = parseCueTimestamps(await readFile(cuePath, 'utf8'))

    const ffprobe = await runTimed(ffprobePath, [
      '-fflags',
      '+genpts',
      '-v',
      'error',
      '-skip_frame',
      'nokey',
      '-show_entries',
      'format=duration',
      '-show_entries',
      'stream=duration',
      '-show_entries',
      'packet=pts_time,flags',
      '-select_streams',
      'v:0',
      '-of',
      'csv',
      file,
    ])
    const scanned = parseFfprobeCsv(ffprobe.stdout)
    const statistics = await stat(file)
    const containerDurationSeconds = Number(identity.container?.properties?.duration ?? 0) / 1e9

    return {
      file: basename(file),
      sizeBytes: statistics.size,
      containerDurationSeconds,
      metadata: {
        elapsedMs: metadata.elapsedMs,
        maximumResidentSetBytes: metadata.maximumResidentSetBytes,
        keyframeCount: cueTimestamps.length,
        firstKeyframeSeconds: cueTimestamps[0],
        lastKeyframeSeconds: cueTimestamps.at(-1),
        ...summarizeGaps(cueTimestamps, containerDurationSeconds),
      },
      ffprobe: {
        elapsedMs: ffprobe.elapsedMs,
        maximumResidentSetBytes: ffprobe.maximumResidentSetBytes,
        keyframeCount: scanned.keyframes.length,
        durationSeconds: scanned.duration,
        firstKeyframeSeconds: scanned.keyframes[0],
        lastKeyframeSeconds: scanned.keyframes.at(-1),
        ...summarizeGaps(scanned.keyframes, scanned.duration),
      },
      comparison: compareTimestamps(cueTimestamps, scanned.keyframes),
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

const options = parseArguments()
const results = []
for (const file of options.files) results.push(await benchmark(file, options.ffprobe))
console.log(
  JSON.stringify(
    { generatedAt: new Date().toISOString(), ffprobeBinary: basename(options.ffprobe), results },
    null,
    2,
  ),
)
