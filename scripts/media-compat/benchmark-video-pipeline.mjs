import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

const wait = (ms) => new Promise((resolve_) => setTimeout(resolve_, ms))

const parseArguments = () => {
  const values = process.argv.slice(2).filter((value) => value !== '--')
  const bundled = resolve(
    import.meta.dirname,
    '../..',
    'resources',
    'ffmpeg',
    `${process.platform}-${process.arch}`,
    process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg',
  )
  const options = {
    ffmpeg: existsSync(bundled) ? bundled : 'ffmpeg',
    durationSeconds: 30,
    starts: [],
    timeoutMs: 120_000,
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--file') options.file = resolve(values[++index])
    else if (value === '--ffmpeg') options.ffmpeg = resolve(values[++index])
    else if (value === '--duration') options.durationSeconds = Number(values[++index])
    else if (value === '--start') options.starts.push(Number(values[++index]))
    else if (value === '--timeout-ms') options.timeoutMs = Number(values[++index])
    else throw new Error(`未知参数：${value}`)
  }
  if (!options.file || !existsSync(options.file)) throw new Error('缺少有效 --file')
  if (!options.starts.length) options.starts.push(0)
  if (!(options.durationSeconds > 0) || !(options.timeoutMs > 0)) throw new Error('时长参数无效')
  return options
}

const profiles = [
  {
    id: 'software-decode-videotoolbox-encode',
    decoderClass: 'software',
    encoderClass: 'hardware',
    input: [],
    encoder: ['-c:v', 'h264_videotoolbox', '-realtime', 'true', '-b:v', '8M'],
  },
  {
    id: 'software-decode-libx264-encode',
    decoderClass: 'software',
    encoderClass: 'software',
    input: [],
    encoder: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-sc_threshold', '0'],
  },
  {
    id: 'videotoolbox-decode-videotoolbox-encode',
    decoderClass: 'hardware',
    encoderClass: 'hardware',
    input: ['-hwaccel', 'videotoolbox'],
    encoder: ['-c:v', 'h264_videotoolbox', '-realtime', 'true', '-b:v', '8M'],
  },
]

const outputArguments = (directory, profile, options, start) => [
  '-hide_banner',
  '-loglevel',
  'warning',
  '-nostdin',
  '-progress',
  'pipe:1',
  '-nostats',
  ...profile.input,
  ...(start > 0 ? ['-ss', String(start)] : []),
  '-i',
  options.file,
  '-t',
  String(options.durationSeconds),
  '-map',
  '0:v:0',
  '-an',
  ...profile.encoder,
  '-pix_fmt',
  'yuv420p',
  '-flags',
  '+cgop',
  '-force_key_frames',
  'expr:gte(t,n_forced*2)',
  '-f',
  'hls',
  '-hls_time',
  '2',
  '-hls_list_size',
  '0',
  '-hls_playlist_type',
  'event',
  '-hls_segment_type',
  'fmp4',
  '-hls_flags',
  'independent_segments+temp_file',
  '-hls_fmp4_init_filename',
  'init.mp4',
  '-hls_segment_filename',
  join(directory, 'segment-%05d.m4s'),
  '-y',
  join(directory, 'index.m3u8'),
]

const parseTimeMetrics = (source, fallbackRealSeconds) => {
  const number = (pattern) => {
    const match = source.match(pattern)
    return match ? Number(match[1]) : undefined
  }
  const realSeconds = number(/([\d.]+)\s+real/) ?? fallbackRealSeconds
  const userSeconds = number(/([\d.]+)\s+user/)
  const systemSeconds = number(/([\d.]+)\s+sys/)
  return {
    realSeconds,
    userSeconds,
    systemSeconds,
    approximateCpuPercent:
      userSeconds === undefined || systemSeconds === undefined
        ? undefined
        : ((userSeconds + systemSeconds) / realSeconds) * 100,
    maximumResidentSetBytes: number(/(\d+)\s+maximum resident set size/),
  }
}

const lastProgressValue = (source, key) => {
  const matches = [...source.matchAll(new RegExp(`^${key}=(.+)$`, 'gm'))]
  return matches.at(-1)?.[1]
}

const runProfile = async (profile, options, start) => {
  const directory = await mkdtemp(join(tmpdir(), 'marchen-video-pipeline-'))
  const started = process.hrtime.bigint()
  let firstSegmentMs
  let timedOut = false
  try {
    const command = process.platform === 'darwin' ? '/usr/bin/time' : options.ffmpeg
    const arguments_ =
      process.platform === 'darwin'
        ? ['-l', options.ffmpeg, ...outputArguments(directory, profile, options, start)]
        : outputArguments(directory, profile, options, start)
    const child = spawn(command, arguments_, {
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdout = []
    const stderr = []
    child.stdout.on('data', (chunk) => stdout.push(chunk))
    child.stderr.on('data', (chunk) => stderr.push(chunk))
    const timeout = setTimeout(() => {
      timedOut = true
      if (process.platform === 'win32') child.kill('SIGKILL')
      else {
        try {
          process.kill(-child.pid, 'SIGKILL')
        } catch {}
      }
    }, options.timeoutMs)

    const monitor = (async () => {
      while (child.exitCode === null && firstSegmentMs === undefined) {
        const entries = await readdir(directory)
        const segment = entries.find((name) => name.endsWith('.m4s'))
        if (segment && (await stat(join(directory, segment))).size > 0) {
          firstSegmentMs = Number(process.hrtime.bigint() - started) / 1_000_000
          return
        }
        await wait(20)
      }
    })()
    const exit = await new Promise((resolve_) => {
      child.once('error', (error) => resolve_({ error }))
      child.once('exit', (code, signal) => resolve_({ code, signal }))
    })
    clearTimeout(timeout)
    await monitor
    const elapsedSeconds = Number(process.hrtime.bigint() - started) / 1_000_000_000
    const output = Buffer.concat(stdout).toString('utf8')
    const error = Buffer.concat(stderr).toString('utf8')
    const entries = await readdir(directory)
    const segments = entries.filter((name) => name.endsWith('.m4s'))
    let outputBytes = 0
    for (const entry of entries) outputBytes += (await stat(join(directory, entry))).size
    const metrics = parseTimeMetrics(error, elapsedSeconds)

    return {
      profile: profile.id,
      decoderClass: profile.decoderClass,
      encoderClass: profile.encoderClass,
      startSeconds: start,
      durationSeconds: options.durationSeconds,
      status: exit.code === 0 && !timedOut ? 'succeeded' : timedOut ? 'timed-out' : 'failed',
      exitCode: exit.code,
      signal: exit.signal,
      firstSegmentMs,
      ...metrics,
      processingSpeed: lastProgressValue(output, 'speed'),
      outputTimeSeconds: Number(lastProgressValue(output, 'out_time_us') ?? 0) / 1_000_000,
      segmentCount: segments.length,
      outputBytes,
      stderrTail: exit.code === 0 ? undefined : error.slice(-1200),
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

const options = parseArguments()
const results = []
for (const start of options.starts) {
  for (const profile of profiles) results.push(await runProfile(profile, options, start))
}
console.log(
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      file: basename(options.file),
      results,
    },
    null,
    2,
  ),
)
