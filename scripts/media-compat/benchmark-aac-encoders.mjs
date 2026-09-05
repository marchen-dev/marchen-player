import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

const wait = (ms) => new Promise((resolve_) => setTimeout(resolve_, ms))

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

const bundledBinary = (name) => {
  const path = resolve(
    import.meta.dirname,
    '../..',
    'resources',
    'ffmpeg',
    `${process.platform}-${process.arch}`,
    process.platform === 'win32' ? `${name}.exe` : name,
  )
  return existsSync(path) ? path : name
}

const parseArguments = () => {
  const values = process.argv.slice(2).filter((value) => value !== '--')
  const options = {
    ffmpeg: bundledBinary('ffmpeg'),
    ffprobe: bundledBinary('ffprobe'),
    durationSeconds: 60,
    starts: [],
    files: [],
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--duration') options.durationSeconds = Number(values[++index])
    else if (value === '--start') options.starts.push(Number(values[++index]))
    else if (value === '--ffmpeg') options.ffmpeg = resolve(values[++index])
    else if (value === '--ffprobe') options.ffprobe = resolve(values[++index])
    else options.files.push(resolve(value))
  }
  if (!options.files.length) throw new Error('缺少音频或视频输入文件')
  if (!options.starts.length) options.starts.push(0)
  return options
}

const finite = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

const probeInput = async (file, ffprobe) => {
  const result = await run(ffprobe, [
    '-v',
    'error',
    '-select_streams',
    'a:0',
    '-show_entries',
    'stream=codec_name,channels,channel_layout,sample_rate,start_time,duration',
    '-show_entries',
    'format=duration',
    '-of',
    'json',
    file,
  ])
  const value = JSON.parse(result.stdout)
  const stream = value.streams?.[0]
  if (!stream) throw new Error(`${basename(file)} 缺少音频轨道`)
  return {
    codec: stream.codec_name,
    channels: Number(stream.channels),
    channelLayout: stream.channel_layout,
    sampleRate: Number(stream.sample_rate),
    startTime: finite(stream.start_time) ?? 0,
    duration: finite(stream.duration) ?? finite(value.format?.duration),
  }
}

const parseTime = (source, fallbackRealSeconds) => {
  const number = (pattern) => {
    const match = source.match(pattern)
    return match ? Number(match[1]) : undefined
  }
  const realSeconds = number(/([\d.]+)\s+real/) ?? fallbackRealSeconds
  const userSeconds = number(/([\d.]+)\s+user/)
  const systemSeconds = number(/([\d.]+)\s+sys/)
  return {
    realSeconds,
    approximateCpuPercent:
      userSeconds === undefined || systemSeconds === undefined
        ? undefined
        : ((userSeconds + systemSeconds) / realSeconds) * 100,
    maximumResidentSetBytes: number(/(\d+)\s+maximum resident set size/),
  }
}

const inspectOutput = async (manifest, ffprobe) => {
  const result = await run(ffprobe, [
    '-v',
    'error',
    '-select_streams',
    'a:0',
    '-show_entries',
    'stream=codec_name,profile,channels,channel_layout,sample_rate,bit_rate',
    '-show_entries',
    'packet=pts_time',
    '-read_intervals',
    '%+0.2',
    '-of',
    'json',
    manifest,
  ])
  const value = JSON.parse(result.stdout)
  const stream = value.streams?.[0] ?? {}
  return {
    codec: stream.codec_name,
    profile: stream.profile,
    channels: Number(stream.channels),
    channelLayout: stream.channel_layout,
    sampleRate: Number(stream.sample_rate),
    bitRate: finite(stream.bit_rate),
    firstPtsSeconds: finite(value.packets?.[0]?.pts_time),
  }
}

const runCase = async (file, input, encoder, start, options) => {
  const directory = await mkdtemp(join(tmpdir(), 'marchen-aac-spike-'))
  const started = process.hrtime.bigint()
  let firstSegmentMs
  try {
    const outputChannels = input.channels === 1 ? 1 : 2
    const manifest = join(directory, 'index.m3u8')
    const ffmpegArguments = [
      '-hide_banner',
      '-loglevel',
      'warning',
      '-nostdin',
      '-progress',
      'pipe:1',
      '-nostats',
      ...(start > 0 ? ['-ss', String(start)] : []),
      '-i',
      file,
      '-t',
      String(Math.min(options.durationSeconds, Math.max(0.1, input.duration - start))),
      '-map',
      '0:a:0',
      '-vn',
      '-c:a',
      encoder,
      ...(encoder === 'aac' ? ['-profile:a', 'aac_low'] : []),
      '-ar',
      '48000',
      '-ac',
      String(outputChannels),
      '-b:a',
      '192k',
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
      'temp_file',
      '-hls_fmp4_init_filename',
      'init.mp4',
      '-hls_segment_filename',
      join(directory, 'segment-%05d.m4s'),
      '-y',
      manifest,
    ]
    const command = process.platform === 'darwin' ? '/usr/bin/time' : options.ffmpeg
    const arguments_ =
      process.platform === 'darwin' ? ['-l', options.ffmpeg, ...ffmpegArguments] : ffmpegArguments
    const child = spawn(command, arguments_, { stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout = []
    const stderr = []
    child.stdout.on('data', (chunk) => stdout.push(chunk))
    child.stderr.on('data', (chunk) => stderr.push(chunk))
    const monitor = (async () => {
      while (child.exitCode === null && firstSegmentMs === undefined) {
        const segment = (await readdir(directory)).find((name) => name.endsWith('.m4s'))
        if (segment && (await stat(join(directory, segment))).size > 0) {
          firstSegmentMs = Number(process.hrtime.bigint() - started) / 1_000_000
          return
        }
        await wait(10)
      }
    })()
    const exit = await new Promise((resolve_) =>
      child.once('exit', (code, signal) => resolve_({ code, signal })),
    )
    await monitor
    const elapsedSeconds = Number(process.hrtime.bigint() - started) / 1_000_000_000
    const stdoutText = Buffer.concat(stdout).toString('utf8')
    const stderrText = Buffer.concat(stderr).toString('utf8')
    const speed = [...stdoutText.matchAll(/^speed=(.+)$/gm)].at(-1)?.[1]
    if (exit.code !== 0) {
      return {
        encoder,
        startSeconds: start,
        status: 'failed',
        exitCode: exit.code,
        stderrTail: stderrText.slice(-1200),
      }
    }
    return {
      encoder,
      startSeconds: start,
      status: 'succeeded',
      firstSegmentMs,
      ...parseTime(stderrText, elapsedSeconds),
      processingSpeed: speed,
      output: await inspectOutput(manifest, options.ffprobe),
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

const options = parseArguments()
const results = []
for (const file of options.files) {
  const input = await probeInput(file, options.ffprobe)
  const cases = []
  for (const start of options.starts.filter((value) => value < input.duration)) {
    for (const encoder of ['aac_at', 'aac'])
      cases.push(await runCase(file, input, encoder, start, options))
  }
  results.push({ file: basename(file), input, cases })
}
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2))
