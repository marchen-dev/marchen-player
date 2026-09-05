// 对照 Jellyfin 的 copy seek 偏移与累计切点。独立实验，不替代真实应用验收。
import { execFile, spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const ffmpeg = resolve(`resources/ffmpeg/${process.platform}-${process.arch}/ffmpeg`)
const ffprobe = resolve(`resources/ffmpeg/${process.platform}-${process.arch}/ffprobe`)
const electronBinary = require('electron')
const hlsPath = process.env.MARCHEN_SPIKE_HLS_PATH || require.resolve('hls.js/dist/hls.min.js')
const root = await mkdtemp(join(tmpdir(), 'marchen-jellyfin-boundary-'))
const keyframes = [0, 7, 12, 14, 18, 24, 30]
const duration = 32
const clampTail = process.env.MARCHEN_SPIKE_CLAMP_TAIL !== '0'
const targets = JSON.parse(process.env.MARCHEN_SPIKE_TARGETS || '[8,20,8,26,1]')
const segments = []
let last = 0
let cut = 6
for (const keyframe of keyframes) {
  if (keyframe < cut) continue
  segments.push({ index: segments.length, start: last, duration: keyframe - last })
  last = keyframe
  cut += 6
}
if (last < duration)
  segments.push({ index: segments.length, start: last, duration: duration - last })
const source = join(root, 'source.mp4')
const parse = (text) => {
  const result = []
  let seconds
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('#EXTINF:')) seconds = Number(line.slice(8).split(',')[0])
    if (/^segment-\d+\.m4s$/.test(line))
      result.push({ index: Number(line.match(/\d+/)[0]), duration: seconds, name: line })
  }
  return result
}
const makeJob = async (index, offset, id) => {
  const directory = join(root, `job-${id}`)
  await mkdir(directory)
  const start = segments[index].start
  const seek = start > 0 ? (clampTail ? Math.min(start + offset, duration - 5) : start + offset) : 0
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    ...(seek ? ['-ss', String(seek)] : []),
    '-i',
    source,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0',
    '-c',
    'copy',
    '-bsf:v',
    'h264_mp4toannexb',
    '-start_at_zero',
    '-copyts',
    '-avoid_negative_ts',
    'disabled',
    '-f',
    'hls',
    '-hls_time',
    '6',
    '-hls_list_size',
    '0',
    '-hls_playlist_type',
    'vod',
    '-hls_segment_type',
    'fmp4',
    '-hls_segment_options',
    'movflags=+frag_discont+skip_sidx',
    '-start_number',
    String(index),
    '-hls_fmp4_init_filename',
    'init.mp4',
    '-hls_segment_filename',
    join(directory, 'segment-%05d.m4s'),
    '-y',
    join(directory, 'index.m3u8'),
  ]
  await run(ffmpeg, args, { timeout: 15000 })
  const actual = parse(await readFile(join(directory, 'index.m3u8'), 'utf8'))
  const init = await readFile(join(directory, 'init.mp4'))
  const inspected = []
  for (const entry of actual) {
    const path = join(directory, 'inspect.mp4')
    await writeFile(path, Buffer.concat([init, await readFile(join(directory, entry.name))]))
    const { stdout } = await run(
      ffprobe,
      [
        '-v',
        'error',
        '-show_packets',
        '-show_entries',
        'packet=codec_type,pts_time,duration_time',
        '-of',
        'json',
        path,
      ],
      { maxBuffer: 4 * 1024 * 1024, timeout: 15000 },
    )
    const packets = JSON.parse(stdout).packets || []
    const ranges = {}
    for (const type of ['video', 'audio']) {
      const track = packets.filter(
        (p) => p.codec_type === type && Number.isFinite(Number(p.pts_time)),
      )
      if (track.length)
        ranges[type] = {
          start: Math.min(...track.map((p) => Number(p.pts_time))),
          end: Math.max(...track.map((p) => Number(p.pts_time) + Number(p.duration_time || 0))),
        }
    }
    inspected.push({ ...entry, planned: segments[entry.index] || null, ranges })
  }
  return { directory, start, seek, index, actual: inspected }
}
const html = `<!doctype html><meta charset="utf-8"><video muted playsinline></video><canvas width="320" height="180"></canvas><script src="/hls.js"></script><script>
const video = document.querySelector('video'), canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d', {willReadFrequently:true}), errors=[], events=[], steps=[];
const state = () => ({time:video.currentTime,ready:video.readyState,error:video.error?.code,frames:video.getVideoPlaybackQuality().totalVideoFrames,buffered:Array.from({length:video.buffered.length},(_,i)=>[video.buffered.start(i),video.buffered.end(i)])});
const wait = (fn,ms) => new Promise((yes,no)=>{const end=performance.now()+ms; const poll=()=>{if(fn())return yes();if(performance.now()>end)return no(new Error('wait timeout'));setTimeout(poll,30)};poll()});
const contentSeconds = () => {ctx.drawImage(video,0,0,320,180);let n=0;for(let b=0;b<6;b++){if(ctx.getImageData(b*32+16,16,1,1).data[0]>128)n+=2**b;}return n;};
(async()=>{
 const hls=new Hls({startPosition:0,backBufferLength:0,maxBufferLength:4,maxMaxBufferLength:8});
 hls.on(Hls.Events.ERROR,(_,d)=>errors.push({type:d.type,details:d.details,fatal:d.fatal}));
 hls.on(Hls.Events.FRAG_BUFFERED,(_,d)=>events.push({sn:d.frag.sn,start:d.frag.start,startPTS:d.frag.startPTS,endPTS:d.frag.endPTS}));
 hls.attachMedia(video);hls.loadSource('/index.m3u8');
 try {
  await wait(()=>video.readyState>=2,10000); await video.play(); await wait(()=>video.currentTime>1,5000);
  for(const target of ${JSON.stringify(targets)}) {
   video.pause();hls.stopLoad();await fetch('/restart',{method:'POST'});
   const frames=state().frames, begin=performance.now(); video.currentTime=target;hls.startLoad(target);await video.play();
   await wait(()=>!video.seeking && video.readyState>=2 && video.currentTime>=target+0.6 && state().frames>frames,8000);
   await new Promise(resolve=>setTimeout(resolve,350));
   const s=state(), content=contentSeconds();steps.push({target,elapsed:performance.now()-begin,...s,contentSeconds:content,contentMatches:Math.abs(content-s.time)<1.5,targetMatches:s.time<target+2});
  }
  await fetch('/result',{method:'POST',body:JSON.stringify({ok:steps.every(s=>s.contentMatches&&s.targetMatches),version:Hls.version,steps,errors,events,state:state()})});
 } catch(e) {await fetch('/result',{method:'POST',body:JSON.stringify({ok:false,version:Hls.version,error:e.message,steps,errors,events,state:state()})});}
 hls.destroy();
})();</script>`
let electron, server
try {
  const bits = Array.from(
    { length: 6 },
    (_, b) =>
      `drawbox=x=${b * 32}:y=0:w=32:h=32:color=white:t=fill:enable='gte(mod(floor(t)/${2 ** b},2),1)'`,
  )
  await run(
    ffmpeg,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      `testsrc2=size=320x180:rate=24:duration=${duration}`,
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=440:sample_rate=48000:duration=${duration}`,
      '-vf',
      ['drawbox=x=0:y=0:w=192:h=32:color=black:t=fill', ...bits].join(','),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-g',
      '9999',
      '-sc_threshold',
      '0',
      '-force_key_frames',
      keyframes.join(','),
      '-c:a',
      'aac',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-y',
      source,
    ],
    { timeout: 15000 },
  )
  const packetResult = await run(
    ffprobe,
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-skip_frame',
      'nokey',
      '-show_frames',
      '-show_entries',
      'frame=best_effort_timestamp_time',
      '-of',
      'json',
      source,
    ],
    { timeout: 15000 },
  )
  const measuredKeys = JSON.parse(packetResult.stdout).frames.map((f) =>
    Number(f.best_effort_timestamp_time),
  )
  const jobTables = []
  for (const offset of [0, 0.5])
    for (const index of [0, 1, 2, 3]) {
      const job = await makeJob(index, offset, `table-${offset}-${index}`)
      jobTables.push({ offset, index, start: job.start, seek: job.seek, segments: job.actual })
    }
  const browser = []
  for (const offset of [0, 0.5]) {
    let job,
      serial = 0,
      epoch = 0,
      queue = Promise.resolve(),
      resolveResult
    const jobs = [],
      requests = []
    const initial = await makeJob(0, offset, `init-${offset}`)
    const init = await readFile(join(initial.directory, 'init.mp4'))
    const resultPromise = new Promise((resolve_) => {
      resolveResult = resolve_
    })
    const manifest = [
      '#EXTM3U',
      '#EXT-X-PLAYLIST-TYPE:VOD',
      '#EXT-X-VERSION:7',
      '#EXT-X-TARGETDURATION:7',
      '#EXT-X-MEDIA-SEQUENCE:0',
      '#EXT-X-MAP:URI="/init.mp4"',
      ...segments.flatMap((s) => [`#EXTINF:${s.duration.toFixed(6)},`, `/segments/${s.index}.m4s`]),
      '#EXT-X-ENDLIST',
      '',
    ].join('\n')
    server = createServer(async (req, res) => {
      try {
        const path = new URL(req.url, 'http://127.0.0.1').pathname
        requests.push(path)
        res.setHeader('cache-control', 'no-store')
        if (path === '/') {
          res.setHeader('content-type', 'text/html')
          res.end(html)
        } else if (path === '/hls.js') {
          res.setHeader('content-type', 'text/javascript')
          res.end(await readFile(hlsPath))
        } else if (path === '/index.m3u8') {
          res.setHeader('content-type', 'application/vnd.apple.mpegurl')
          res.end(manifest)
        } else if (path === '/init.mp4') {
          res.setHeader('content-type', 'video/mp4')
          res.end(init)
        } else if (path === '/restart') {
          // 显式制造缓存缺失与 Job 重启，避免全片预生成掩盖问题；不是 Jellyfin 默认清理策略。
          await queue
          job = undefined
          epoch++
          res.end('ok')
        } else if (path === '/result') {
          let body = ''
          for await (const part of req) body += part
          res.end('ok')
          resolveResult(JSON.parse(body))
        } else if (/^\/segments\/\d+\.m4s$/.test(path)) {
          const index = Number(path.match(/\d+/)[0])
          queue = queue
            .then(async () => {
              if (!job || !job.actual.some((s) => s.index === index)) {
                job = await makeJob(index, offset, `browser-${offset}-${serial++}`)
                jobs.push({ epoch, index, start: job.start, seek: job.seek, segments: job.actual })
              }
              const entry = job.actual.find((s) => s.index === index)
              if (!entry) {
                res.statusCode = 404
                res.end()
                return
              }
              res.setHeader('content-type', 'video/iso.segment')
              res.end(await readFile(join(job.directory, entry.name)))
            })
            .catch(() => {
              res.statusCode = 500
              res.end()
            })
        } else {
          res.statusCode = 404
          res.end()
        }
      } catch {
        res.statusCode = 500
        res.end()
      }
    })
    await new Promise((resolve_) => server.listen(0, '127.0.0.1', resolve_))
    const env = {
      ...process.env,
      MARCHEN_DYNAMIC_HLS_SPIKE_URL: `http://127.0.0.1:${server.address().port}/`,
    }
    delete env.ELECTRON_RUN_AS_NODE
    electron = spawn(
      electronBinary,
      [resolve('scripts/media-compat/dynamic-hls-spike-electron.cjs')],
      { env, stdio: 'ignore' },
    )
    let timer
    const result = await Promise.race([
      resultPromise,
      new Promise((resolve_) => {
        timer = setTimeout(() => resolve_({ ok: false, error: 'browser timeout' }), 55000)
      }),
    ])
    clearTimeout(timer)
    browser.push({ offset, ...result, jobs, requests })
    electron.kill('SIGTERM')
    await new Promise((resolve_) => electron.once('exit', resolve_))
    electron = undefined
    await queue
    await new Promise((resolve_) => {
      server.close(resolve_)
      server.closeAllConnections()
    })
    server = undefined
  }
  const { stdout: version } = await run(ffmpeg, ['-version'])
  const report = {
    experiment:
      'Jellyfin copy parameters on bundled FFmpeg; forced cache misses, not full Jellyfin server',
    ffmpeg: version.split('\n')[0],
    measuredKeys,
    targets,
    clampTail,
    plannedSegments: segments,
    jobTables,
    browser,
  }
  const output = resolve(
    process.env.MARCHEN_SPIKE_OUTPUT || 'test-results/media-compat/jellyfin-boundary-spike.json',
  )
  await mkdir(resolve('test-results/media-compat'), { recursive: true })
  await writeFile(output, JSON.stringify(report, null, 2) + '\n')
  console.log(
    JSON.stringify(
      {
        output,
        browser: browser.map(({ offset, ok, error, version, steps, jobs }) => ({
          offset,
          ok,
          error,
          version,
          steps,
          jobCount: jobs.length,
        })),
      },
      null,
      2,
    ),
  )
} finally {
  if (electron) electron.kill('SIGTERM')
  if (server)
    await new Promise((resolve_) => {
      server.close(resolve_)
      server.closeAllConnections()
    })
  await rm(root, { recursive: true, force: true })
}
