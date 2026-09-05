import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { FfmpegProcessExecutor } from '../ffmpeg/executor'
import { InitFingerprintGuard, inspectInitFingerprint } from '../ffmpeg/init-fingerprint'
import { createKeyframeAlignedTimeline } from './hls-timeline'
import { compileDynamicHlsJob } from './dynamic-hls-job-compiler'
import { DynamicHlsPublisher } from './dynamic-hls-publisher'
import { inspectSegmentMedia } from './segment-media-inspector'
import { createDynamicHlsManifest } from './dynamic-hls-manifest'
import { DynamicHlsRequestCoordinator } from './dynamic-hls-coordinator'
import { MediaGatewayRegistry } from './registry'
import { MediaGatewayRouter } from './router'
import { MediaGatewayServer } from './server'
import { SegmentStore } from './segment-store'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const ffmpeg = resolve(`resources/ffmpeg/${process.platform}-${process.arch}/ffmpeg`)
const ffprobe = resolve(`resources/ffmpeg/${process.platform}-${process.arch}/ffprobe`)
interface BrowserResult {
  ok: boolean
  error?: string
  version: string
  steps: Array<{ target: number; time: number; content: number }>
  errors: unknown[]
}

describe.runIf(process.platform === 'darwin' && existsSync(ffmpeg))(
  '正式 Dynamic HLS 浏览器链路',
  () => {
    it('稳定入口经过真实 Publisher/Gateway，在片尾及驱逐后回跳保持内容时间', async () => {
      const root = await mkdtemp(join(tmpdir(), 'marchen-formal-browser-'))
      const registry = new MediaGatewayRegistry()
      const session = registry.createSession('synthetic')
      const timeline = createKeyframeAlignedTimeline({
        sourceStartTime: 0,
        duration: 32,
        targetSegmentDuration: 6,
        keyframes: [0, 7, 12, 14, 18, 24, 30],
      })
      const store = new SegmentStore(session.id, timeline, (index) =>
        registry.unregisterEvictedResource(session.id, `segment-${index}.m4s`),
      )
      const coordinator = new DynamicHlsRequestCoordinator()
      const guard = new InitFingerprintGuard()
      const executor = new FfmpegProcessExecutor()
      const hls = await readFile(require.resolve('hls.js/dist/hls.min.js'))
      const jobs: number[] = []
      const requests: number[] = []
      const evictions: number[][] = []
      const serverErrors: string[] = []
      let pending: Promise<void> = Promise.resolve()
      let serial = 0
      let url = ''
      let finish!: (result: BrowserResult) => void
      const resultPromise = new Promise<BrowserResult>((resolve_) => {
        finish = resolve_
      })
      const pageServer = createServer(async (request, response) => {
        try {
          if (request.url === '/hls.js') {
            response.setHeader('content-type', 'text/javascript')
            response.end(hls)
            return
          }
          if (request.url === '/result') {
            let body = ''
            for await (const chunk of request) body += chunk
            response.end()
            finish(JSON.parse(body) as BrowserResult)
            return
          }
          if (request.url === '/evict') {
            await pending
            // 故意驱逐以证明真实再生，而不是从上个 Job 完整预生成的文件命中。
            const evicted: number[] = []
            for (const entry of store.snapshot.entries)
              if (store.evict(entry.index)) evicted.push(entry.index)
            evictions.push(evicted)
            response.end()
            return
          }
          response.setHeader('content-type', 'text/html')
          response.end(`<!doctype html><video muted playsinline></video><canvas width="320" height="180"></canvas><script src="/hls.js"></script><script>
const v=document.querySelector('video'),c=document.querySelector('canvas').getContext('2d',{willReadFrequently:true}),steps=[],errors=[];
const wait=(f,ms)=>new Promise((yes,no)=>{const end=performance.now()+ms;const tick=()=>{if(f())return yes();if(performance.now()>end)return no(new Error('timeout'));setTimeout(tick,30)};tick()});
const h=new Hls({startPosition:0,backBufferLength:0,maxBufferLength:4,maxMaxBufferLength:8});h.on(Hls.Events.ERROR,(_,d)=>errors.push({details:d.details,fatal:d.fatal}));
const content=()=>{c.drawImage(v,0,0,320,180);let n=0;for(let b=0;b<10;b++)if(c.getImageData(b*24+12,8,1,1).data[0]>128)n+=2**b;return n/24;};
(async()=>{try{h.attachMedia(v);h.loadSource(${JSON.stringify(url)});await wait(()=>v.readyState>=2,15000);await v.play();await wait(()=>v.currentTime>1,5000);
for(const target of [8,20,8,26,1]){v.pause();h.stopLoad();h.trigger(Hls.Events.BUFFER_FLUSHING,{startOffset:0,endOffset:Infinity});await wait(()=>v.buffered.length===0,3000);await fetch('/evict',{method:'POST'});v.currentTime=target;h.startLoad(target);await v.play();await wait(()=>!v.seeking&&v.readyState>=2&&v.currentTime>target+0.6,10000);await new Promise(r=>setTimeout(r,350));steps.push({target,time:v.currentTime,content:content()});if(steps.length===1){await wait(()=>v.currentTime>15.6,10000);steps.push({target:15,time:v.currentTime,content:content()});}}
await fetch('/result',{method:'POST',body:JSON.stringify({ok:steps.every(s=>s.time<s.target+2&&Math.abs(s.time-s.content)<0.15),version:Hls.version,runtime:navigator.userAgent,steps,errors})});}
catch(e){await fetch('/result',{method:'POST',body:JSON.stringify({ok:false,error:e.message,version:Hls.version,runtime:navigator.userAgent,steps,errors})});}h.destroy()})();</script>`)
        } catch (error) {
          serverErrors.push(String(error))
          response.statusCode = 500
          response.end()
        }
      })
      const router = new MediaGatewayRouter(registry, {
        dynamicHlsV2Enabled: true,
        dynamicHlsCoordinator: coordinator,
        isOriginAllowed: (origin) => origin === pageOrigin,
      })
      const gateway = new MediaGatewayServer((req, res) => {
        const setHeader = res.setHeader.bind(res)
        res.setHeader = (name, value) =>
          setHeader(name, name.toLowerCase() === 'cache-control' ? 'no-store' : value)
        const m = req.url?.match(/segments\/(\d+)/)
        if (m) requests.push(Number(m[1]))
        return router.handle(req, res)
      })
      let pageOrigin = ''
      let electron: ReturnType<typeof spawn> | undefined
      let timeout: ReturnType<typeof setTimeout> | undefined
      try {
        const source = join(root, 'source.mp4')
        const bits = Array.from(
          { length: 10 },
          (_, b) =>
            `drawbox=x=${b * 24}:y=0:w=24:h=16:color=white:t=fill:enable='gte(mod(floor(t*24+0.001)/${2 ** b},2),1)'`,
        )
        await run(ffmpeg, [
          '-v',
          'error',
          '-f',
          'lavfi',
          '-i',
          'testsrc2=size=320x180:rate=24:duration=32',
          '-f',
          'lavfi',
          '-i',
          'sine=sample_rate=48000:duration=32',
          '-vf',
          ['drawbox=x=0:y=0:w=240:h=16:color=black:t=fill', ...bits].join(','),
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-g',
          '9999',
          '-sc_threshold',
          '0',
          '-force_key_frames',
          '0,7,12,14,18,24,30',
          '-c:a',
          'aac',
          '-y',
          source,
        ])
        const manifest = join(root, 'stable.m3u8')
        await writeFile(manifest, createDynamicHlsManifest(timeline))
        registry.registerStableResource(session.id, 'index.m3u8', {
          path: manifest,
          mimeType: 'application/vnd.apple.mpegurl',
          cacheControl: 'no-cache',
          complete: true,
        })
        coordinator.register(session.token, store, {
          request: (index) => {
            pending = pending
              .catch(() => undefined)
              .then(async () => {
                if (store.snapshot.entries[index]?.status === 'published') return
                const directory = join(root, `job-${serial++}`)
                await mkdir(directory)
                const compiled = compileDynamicHlsJob({
                  inputPath: source,
                  outputDirectory: directory,
                  timeline,
                  segmentIndex: index,
                  pipeline: {
                    kind: 'remux',
                    plan: {
                      kind: 'remux',
                      reason: 'container-incompatible',
                      videoStreamIndex: 0,
                      audioStreamIndex: 1,
                      video: 'copy',
                      audio: 'copy',
                    },
                  },
                })
                await executor.run({
                  executable: ffmpeg,
                  arguments: compiled.preset.arguments,
                  inputs: compiled.preset.inputs,
                  gracefulStdin: compiled.gracefulStdin,
                  progress: true,
                  timeoutMs: 10000,
                })
                jobs.push(index)
                await new DynamicHlsPublisher({
                  registry,
                  sessionId: session.id,
                  token: session.token,
                  store,
                  outputDirectory: directory,
                  ptsToleranceSeconds: 0.15,
                  initFingerprintGuard: guard,
                  inspectInitFingerprint: (initPath) =>
                    inspectInitFingerprint({ ffprobe, executor, initPath }),
                  inspectSegment: (initPath, segmentPath) =>
                    inspectSegmentMedia({ ffprobe, executor, initPath, segmentPath }),
                  // 仅此合成样本的已测范围用于测试，不能作为生产 codec 白名单。
                  acceptBoundaryChange: ({ index: segmentIndex, actual }) => {
                    const expected: Record<number, [number, number]> = {
                      1: [7, 14],
                      2: [14, 24],
                      3: [24, 30],
                      4: [30, 32],
                    }
                    const range = expected[segmentIndex]
                    return Boolean(
                      range &&
                      Math.abs(actual.video.start - range[0]) < 0.15 &&
                      Math.abs(actual.video.end - range[1]) < 0.15,
                    )
                  },
                }).refresh()
              })
            pending.catch((error) =>
              serverErrors.push(error instanceof Error ? error.message : String(error)),
            )
            return pending
          },
        })
        const base = await gateway.start()
        url = `${base}/v2/media/${session.token}/index.m3u8`
        await new Promise<void>((resolve_) => pageServer.listen(0, '127.0.0.1', resolve_))
        const address = pageServer.address()
        if (!address || typeof address === 'string') throw new Error('page server address')
        pageOrigin = `http://127.0.0.1:${address.port}`
        const env: NodeJS.ProcessEnv = { ...process.env, MARCHEN_DYNAMIC_HLS_SPIKE_URL: pageOrigin }
        delete env.ELECTRON_RUN_AS_NODE
        electron = spawn(
          require('electron') as string,
          [resolve('scripts/media-compat/dynamic-hls-spike-electron.cjs')],
          { env, stdio: 'ignore' },
        )
        const result = await Promise.race([
          resultPromise,
          new Promise<BrowserResult>((resolve_) => {
            timeout = setTimeout(
              () =>
                resolve_({
                  ok: false,
                  error: 'browser deadline',
                  version: 'unknown',
                  steps: [],
                  errors: [],
                }),
              45000,
            )
          }),
        ])
        await mkdir(resolve('test-results/media-compat'), { recursive: true })
        await writeFile(
          resolve('test-results/media-compat/formal-browser-boundary.json'),
          JSON.stringify(
            {
              scope: '正式模块合成集成，非应用入口验收；no-store 强制缓存缺失',
              ffmpeg: (await run(ffmpeg, ['-version'])).stdout.split('\n')[0],
              result,
              jobs,
              requests,
              evictions,
              serverErrors,
            },
            null,
            2,
          ) + '\n',
        )
        expect(serverErrors).toEqual([])
        expect(result.ok, JSON.stringify(result)).toBe(true)
        expect(jobs.length).toBeGreaterThanOrEqual(5)
      } finally {
        if (timeout) clearTimeout(timeout)
        if (electron && electron.exitCode === null) {
          electron.kill('SIGTERM')
          await new Promise<void>((resolve_) => electron!.once('exit', () => resolve_()))
        }
        await gateway.stop()
        await new Promise<void>((resolve_) => {
          pageServer.close(() => resolve_())
          pageServer.closeAllConnections()
        })
        await pending.catch(() => undefined)
        await rm(root, { recursive: true, force: true })
      }
    }, 60000)
  },
)
