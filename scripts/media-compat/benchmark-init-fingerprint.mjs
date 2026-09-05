import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

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
  const options = { ffmpeg: bundledBinary('ffmpeg'), ffprobe: bundledBinary('ffprobe'), starts: [] }
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--file') options.file = resolve(values[++index])
    else if (values[index] === '--start') options.starts.push(Number(values[++index]))
    else if (values[index] === '--ffmpeg') options.ffmpeg = resolve(values[++index])
    else if (values[index] === '--ffprobe') options.ffprobe = resolve(values[++index])
    else throw new Error(`未知参数：${values[index]}`)
  }
  if (!options.file || !existsSync(options.file)) throw new Error('缺少有效 --file')
  if (!options.starts.length) options.starts.push(0, 600, 1200)
  return options
}

const profiles = [
  {
    id: 'copy-hevc-aac-at',
    video: ['-c:v', 'copy', '-bsf:v', 'hevc_mp4toannexb,extract_extradata', '-tag:v', 'hvc1'],
  },
  {
    id: 'videotoolbox-h264-aac-at',
    video: ['-c:v', 'h264_videotoolbox', '-realtime', 'true', '-b:v', '8M', '-pix_fmt', 'yuv420p'],
  },
  {
    id: 'libx264-aac-at',
    video: [
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-sc_threshold',
      '0',
    ],
  },
]

const hash = (value) => createHash('sha256').update(value).digest('hex')

const normalizeExtradata = (value) =>
  `${value ?? ''}`
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[0-9a-f]+:\s*/i, '').replace(/\s+/g, ''))
    .join('')

const inspect = async (path, ffprobe) => {
  const result = await run(ffprobe, [
    '-v',
    'error',
    '-show_streams',
    '-show_data',
    '-show_entries',
    'stream=index,id,codec_name,codec_tag_string,profile,level,time_base,extradata,extradata_size',
    '-of',
    'json',
    path,
  ])
  const value = JSON.parse(result.stdout)
  return (value.streams ?? []).map((stream) => {
    const extradata = normalizeExtradata(stream.extradata)
    return {
      index: stream.index,
      id: stream.id,
      codec: stream.codec_name,
      sampleEntry: stream.codec_tag_string,
      profile: stream.profile,
      level: stream.level,
      timeBase: stream.time_base,
      extradataSize: stream.extradata_size,
      extradataHash: hash(extradata),
    }
  })
}

const runCase = async (profile, start, options) => {
  const directory = await mkdtemp(join(tmpdir(), 'marchen-init-fingerprint-'))
  try {
    const initPath = join(directory, 'init.mp4')
    await run(options.ffmpeg, [
      '-hide_banner',
      '-loglevel',
      'warning',
      '-nostdin',
      ...(start > 0 ? ['-ss', String(start)] : []),
      '-i',
      options.file,
      '-t',
      '6',
      '-map',
      '0:v:0',
      '-map',
      '0:a:0',
      ...profile.video,
      '-c:a',
      'aac_at',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-b:a',
      '192k',
      ...(profile.id.startsWith('copy-')
        ? []
        : ['-flags', '+cgop', '-force_key_frames', 'expr:gte(t,n_forced*2)']),
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
    ])
    const init = await readFile(initPath)
    return {
      startSeconds: start,
      initBytes: init.length,
      initHash: hash(init),
      streams: await inspect(initPath, options.ffprobe),
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

const comparableFingerprint = (item) => JSON.stringify(item.streams)

const options = parseArguments()
const results = []
for (const profile of profiles) {
  const cases = []
  for (const start of options.starts) cases.push(await runCase(profile, start, options))
  results.push({
    profile: profile.id,
    stableStreamFingerprint: new Set(cases.map(comparableFingerprint)).size === 1,
    stableCompleteInit: new Set(cases.map((item) => item.initHash)).size === 1,
    cases,
  })
}
console.log(
  JSON.stringify(
    { generatedAt: new Date().toISOString(), file: basename(options.file), results },
    null,
    2,
  ),
)
