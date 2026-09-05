import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const hlsScriptPath = require.resolve('hls.js/dist/hls.min.js')
const electronBinary = require('electron')
const ffmpeg = resolve(
  import.meta.dirname,
  '../..',
  'resources',
  'ffmpeg',
  `${process.platform}-${process.arch}`,
  process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg',
)

const run = (command, arguments_) =>
  new Promise((resolve_, reject) => {
    const child = spawn(command, arguments_, { stdio: ['ignore', 'pipe', 'pipe'] })
    const stderr = []
    child.stderr.on('data', (chunk) => stderr.push(chunk))
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve_()
      else {
        reject(
          new Error(
            `${basename(command)} 退出 ${code ?? signal}\n${Buffer.concat(stderr).toString('utf8').slice(-4000)}`,
          ),
        )
      }
    })
  })

const generateSource = (path) =>
  run(ffmpeg, [
    '-hide_banner',
    '-loglevel',
    'warning',
    '-nostdin',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=640x360:rate=30:duration=32',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:sample_rate=48000:duration=32',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-pix_fmt',
    'yuv420p',
    '-g',
    '60',
    '-keyint_min',
    '60',
    '-sc_threshold',
    '0',
    '-c:a',
    'aac',
    '-profile:a',
    'aac_low',
    '-ar',
    '48000',
    '-ac',
    '2',
    '-movflags',
    '+faststart',
    '-y',
    path,
  ])

const generateJob = (source, directory, start, startNumber) =>
  run(ffmpeg, [
    '-hide_banner',
    '-loglevel',
    'warning',
    '-nostdin',
    '-copyts',
    '-avoid_negative_ts',
    'disabled',
    '-start_at_zero',
    ...(start > 0 ? ['-ss', String(start)] : []),
    '-i',
    source,
    ...(start === 0 ? ['-t', '16'] : []),
    '-map',
    '0:v:0',
    '-map',
    '0:a:0',
    '-c',
    'copy',
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
    // Jellyfin 对 fMP4 HLS 使用 frag_discont，确保重启后的音频初始 delay 写入 TFDT。
    '-hls_segment_options',
    'movflags=+frag_discont+skip_sidx',
    '-hls_flags',
    'independent_segments+temp_file',
    '-start_number',
    String(startNumber),
    '-hls_fmp4_init_filename',
    'init.mp4',
    '-hls_segment_filename',
    join(directory, 'segment-%05d.m4s'),
    '-y',
    join(directory, 'index.m3u8'),
  ])

const parseSegments = async (directory) => {
  const manifest = await readFile(join(directory, 'index.m3u8'), 'utf8')
  const segments = []
  let duration
  for (const line of manifest.split(/\r?\n/)) {
    if (line.startsWith('#EXTINF:')) duration = Number(line.slice(8).split(',', 1)[0])
    else if (line.endsWith('.m4s')) {
      segments.push({ name: line, duration })
      duration = undefined
    }
  }
  return segments
}

const html = `<!doctype html>
<meta charset="utf-8">
<video muted playsinline></video>
<script src="/hls.js"></script>
<script>
const video = document.querySelector('video')
const errors = []
const events = []
const videoState = () => ({
  currentTime: video.currentTime,
  duration: video.duration,
  readyState: video.readyState,
  paused: video.paused,
  error: video.error?.code ?? null,
  buffered: Array.from({ length: video.buffered.length }, (_, index) => [video.buffered.start(index), video.buffered.end(index)])
})
const waitFor = (condition, timeoutMs, label) => new Promise((resolve, reject) => {
  const deadline = performance.now() + timeoutMs
  const tick = () => {
    if (condition()) return resolve()
    if (performance.now() > deadline) return reject(new Error(label + ' timeout'))
    setTimeout(tick, 50)
  }
  tick()
})
const post = (value) => fetch('/result', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) })
;(async () => {
  if (!Hls.isSupported()) throw new Error('Hls.js MSE unsupported')
  const hls = new Hls({
    backBufferLength: 0,
    maxBufferLength: 4,
    maxMaxBufferLength: 8,
    fragLoadPolicy: {
      default: {
        maxTimeToFirstByteMs: 10000,
        maxLoadTimeMs: 20000,
        timeoutRetry: { maxNumRetry: 2, retryDelayMs: 100, maxRetryDelayMs: 500 },
        errorRetry: { maxNumRetry: 3, retryDelayMs: 100, maxRetryDelayMs: 500 }
      }
    }
  })
  hls.on(Hls.Events.ERROR, (_event, data) => errors.push({ type: data.type, details: data.details, fatal: data.fatal, code: data.response?.code }))
  hls.on(Hls.Events.FRAG_LOADING, (_event, data) => events.push({ event: 'loading', sn: data.frag.sn, start: data.frag.start }))
  hls.on(Hls.Events.FRAG_BUFFERED, (_event, data) => events.push({ event: 'buffered', sn: data.frag.sn, start: data.frag.start }))
  hls.attachMedia(video)
  hls.loadSource('/index.m3u8')
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('loadedmetadata timeout')), 10000)
    video.addEventListener('loadedmetadata', () => { clearTimeout(timer); resolve() }, { once: true })
  })
  video.currentTime = 21
  await video.play()
  await waitFor(() => video.currentTime > 22 && video.readyState >= 2, 15000, 'forward seek')
  const forward = { currentTime: video.currentTime, decodedFrames: video.getVideoPlaybackQuality?.().totalVideoFrames ?? 0 }
  video.currentTime = 1
  await video.play()
  await waitFor(() => video.currentTime > 2 && video.readyState >= 2, 15000, 'backward seek')
  const backward = { currentTime: video.currentTime, decodedFrames: video.getVideoPlaybackQuality?.().totalVideoFrames ?? 0 }
  await post({ ok: true, duration: video.duration, forward, backward, errors, events, state: videoState() })
  hls.destroy()
})().catch((error) => post({ ok: false, error: error.message, errors, events, state: videoState() }))
</script>`

const readBody = (request) =>
  new Promise((resolve_) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => resolve_(Buffer.concat(chunks).toString('utf8')))
  })

const terminate = async (child) => {
  if (child.exitCode !== null) return
  const waitForExit = (timeoutMs) =>
    Promise.race([
      new Promise((resolve_) => child.once('exit', () => resolve_(true))),
      new Promise((resolve_) => setTimeout(() => resolve_(false), timeoutMs)),
    ])
  const killTree = (signal) => {
    if (process.platform === 'win32') child.kill(signal)
    else {
      try {
        process.kill(-child.pid, signal)
      } catch {}
    }
  }
  killTree('SIGTERM')
  if (!(await waitForExit(1500)) && child.exitCode === null) {
    try {
      killTree('SIGKILL')
    } catch {}
    await waitForExit(1500)
  }
  child.stdout?.destroy()
  child.stderr?.destroy()
}

const root = await mkdtemp(join(tmpdir(), 'marchen-dynamic-hls-spike-'))
const firstDirectory = join(root, 'job-0')
const secondDirectory = join(root, 'job-1')
const source = join(root, 'source.mp4')
const { mkdir } = await import('node:fs/promises')
await Promise.all([mkdir(firstDirectory), mkdir(secondDirectory)])

let server
let electron
try {
  await generateSource(source)
  await generateJob(source, firstDirectory, 0, 0)
  const firstSegments = await parseSegments(firstDirectory)
  await generateJob(source, secondDirectory, 16, firstSegments.length)
  const secondSegments = await parseSegments(secondDirectory)
  const segments = [...firstSegments, ...secondSegments]
  const segmentFiles = new Map()
  for (const entry of await readdir(firstDirectory)) {
    if (entry.endsWith('.m4s')) segmentFiles.set(entry, join(firstDirectory, entry))
  }
  for (const entry of await readdir(secondDirectory)) {
    if (entry.endsWith('.m4s')) segmentFiles.set(entry, join(secondDirectory, entry))
  }

  const manifest = [
    '#EXTM3U',
    '#EXT-X-PLAYLIST-TYPE:VOD',
    '#EXT-X-VERSION:7',
    '#EXT-X-TARGETDURATION:2',
    '#EXT-X-MEDIA-SEQUENCE:0',
    '#EXT-X-INDEPENDENT-SEGMENTS',
    '#EXT-X-MAP:URI="/init.mp4"',
    ...segments.flatMap((segment) => [
      `#EXTINF:${segment.duration.toFixed(6)},`,
      `/segments/${segment.name}`,
    ]),
    '#EXT-X-ENDLIST',
    '',
  ].join('\n')
  const hlsScript = await readFile(hlsScriptPath)
  const init = await readFile(join(firstDirectory, 'init.mp4'))
  const requests = []
  let retriedJobOneSegment
  let resultResolve
  const resultPromise = new Promise((resolve_) => (resultResolve = resolve_))

  server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1')
    requests.push(url.pathname)
    if (url.pathname === '/') {
      response.setHeader('content-type', 'text/html; charset=utf-8')
      response.end(html)
    } else if (url.pathname === '/hls.js') {
      response.setHeader('content-type', 'text/javascript')
      response.end(hlsScript)
    } else if (url.pathname === '/index.m3u8') {
      response.setHeader('content-type', 'application/vnd.apple.mpegurl')
      response.setHeader('cache-control', 'no-cache')
      response.end(manifest)
    } else if (url.pathname === '/init.mp4') {
      response.setHeader('content-type', 'video/mp4')
      response.end(init)
    } else if (url.pathname.startsWith('/segments/')) {
      const name = basename(url.pathname)
      const path = segmentFiles.get(name)
      const index = Number(name.match(/(\d+)/)?.[1])
      if (index >= firstSegments.length && !retriedJobOneSegment) {
        retriedJobOneSegment = name
        response.statusCode = 404
        response.end('not produced yet')
        return
      }
      if (name === retriedJobOneSegment) await new Promise((resolve_) => setTimeout(resolve_, 500))
      if (!path) {
        response.statusCode = 404
        response.end('missing')
      } else {
        response.setHeader('content-type', 'video/iso.segment')
        response.end(await readFile(path))
      }
    } else if (url.pathname === '/result' && request.method === 'POST') {
      const result = JSON.parse(await readBody(request))
      response.end('ok')
      resultResolve(result)
    } else {
      response.statusCode = 404
      response.end('not found')
    }
  })
  await new Promise((resolve_) => server.listen(0, '127.0.0.1', resolve_))
  const address = server.address()
  const url = `http://127.0.0.1:${address.port}/`
  electron = spawn(
    electronBinary,
    [resolve(import.meta.dirname, 'dynamic-hls-spike-electron.cjs')],
    {
      detached: process.platform !== 'win32',
      env: { ...process.env, MARCHEN_DYNAMIC_HLS_SPIKE_URL: url },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const resultTimeout = new Promise((_, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Electron dynamic HLS spike timeout')),
      45000,
    )
    timer.unref()
  })
  const result = await Promise.race([resultPromise, resultTimeout])
  const summary = {
    ...result,
    stableManifestRequests: requests.filter((path) => path === '/index.m3u8').length,
    initRequests: requests.filter((path) => path === '/init.mp4').length,
    retriedSegment: retriedJobOneSegment,
    retriedSegmentRequests: retriedJobOneSegment
      ? requests.filter((path) => path === `/segments/${retriedJobOneSegment}`).length
      : 0,
    requestedSegments: requests.filter((path) => path.startsWith('/segments/')),
  }
  console.log(JSON.stringify(summary, null, 2))
  if (!summary.ok || summary.retriedSegmentRequests < 2) process.exitCode = 1
} finally {
  if (electron) await terminate(electron)
  if (server) {
    await new Promise((resolve_) => {
      server.close(resolve_)
      server.closeAllConnections?.()
    })
  }
  await rm(root, { recursive: true, force: true })
}
