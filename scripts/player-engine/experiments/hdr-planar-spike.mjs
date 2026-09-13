import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, open, mkdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { Input, CustomSource, ALL_FORMATS, EncodedPacketSink } from 'mediabunny'
import { chromium } from 'playwright-core'

const filename = process.argv[2]
if (!filename) throw new Error('需要本地 HEVC PQ 文件参数')
await mkdir('test-results/hdr', { recursive: true })
execFileSync(
  'pnpm',
  [
    'exec',
    'esbuild',
    'scripts/player-engine/tests/adapter-entry.ts',
    '--bundle',
    '--format=esm',
    '--platform=browser',
    '--loader:.frag=text',
    '--outfile=test-results/hdr/decoder.mjs',
  ],
  { stdio: 'pipe' },
)
const file = await open(filename, 'r')
const stat = await file.stat()
const input = new Input({
  formats: ALL_FORMATS,
  source: new CustomSource({
    getSize: () => stat.size,
    read: async (start, end) => {
      const bytes = new Uint8Array(end - start)
      let offset = 0
      while (offset < bytes.length) {
        const result = await file.read(bytes, offset, bytes.length - offset, start + offset)
        if (!result.bytesRead) throw new Error('读取提前结束')
        offset += result.bytesRead
      }
      return bytes
    },
  }),
})
let fixture
try {
  const track = await input.getPrimaryVideoTrack()
  const config = await track.getDecoderConfig()
  const sink = new EncodedPacketSink(track)
  const first = await sink.getKeyPacket(0)
  const packets = []
  for await (const p of sink.packets(first)) {
    packets.push({
      data: Array.from(p.data),
      type: p.type,
      timestamp: p.timestamp,
      duration: p.duration,
    })
    if (packets.length >= 32) break
  }
  fixture = {
    config: { ...config, description: Array.from(new Uint8Array(config.description)) },
    packets,
  }
} finally {
  input.dispose()
  await file.close()
}
const manifest = JSON.parse(await readFile('node_modules/@suemor/libav-hevc/manifest.json', 'utf8'))
const worker = `import {createHevcDecoder} from '/decoder.mjs';onmessage=async({data:fixture})=>{let first;let frames=0;const Decoder=createHevcDecoder({assetBase:location.origin+'/libav',threads:1,shouldDecode:()=>true});const decoder=new Decoder();const pending=[];Object.assign(decoder,{config:{...fixture.config,description:new Uint8Array(fixture.config.description)},onSample(sample){pending.push(sample)}});try{const started=performance.now();await decoder.init();for(const packet of fixture.packets){await decoder.decode({...packet,data:new Uint8Array(packet.data)});await consume()}await decoder.flush();await consume();const elapsedMs=performance.now()-started;postMessage({first,frames,elapsedMs},[first.data.buffer]);async function consume(){while(pending.length){const sample=pending.shift();try{frames++;if(!first){const data=new Uint8Array(sample.allocationSize());const layout=await sample.copyTo(data);first={data,layout,width:sample.codedWidth,height:sample.codedHeight,format:sample.format,colorSpace:{primaries:sample.colorSpace.primaries,matrix:sample.colorSpace.matrix,transfer:sample.colorSpace.transfer,fullRange:sample.colorSpace.fullRange}}}}finally{sample.close()}}}}catch(error){postMessage({error:String(error)})}finally{for(const sample of pending)sample.close();await decoder.close()}}`
const server = createServer(async (req, res) => {
  try {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless')
    const path = new URL(req.url, 'http://localhost').pathname
    let file
    if (path === '/') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(
        '<!doctype html><meta charset="utf-8"><title>HDR 亮度对照测试</title><style>body{background:#222;color:#fff;font:16px sans-serif}canvas{width:80vw;height:auto;display:block;margin:20px}</style><h1>软解 PQ → HDR 小样</h1><p id="status">正在解码并绘制测试色块…</p><script type="module" src="/page.mjs"></script>',
      )
      return
    }
    if (path === '/fixture.json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify(fixture))
      return
    }
    if (path === '/worker.mjs') {
      res.setHeader('Content-Type', 'text/javascript')
      res.end(worker)
      return
    }
    if (path === '/page.mjs') file = 'scripts/player-engine/experiments/hdr-planar-page.js'
    else if (path === '/decoder.mjs') file = 'test-results/hdr/decoder.mjs'
    else if (path === '/renderer.mjs') file = 'scripts/player-engine/experiments/hdr-planar-renderer.js'
    else if (path.startsWith('/libav/') && Object.hasOwn(manifest.files, path.slice(7)))
      file = 'node_modules/@suemor/libav-hevc/dist/' + path.slice(7)
    else {
      res.writeHead(404)
      res.end()
      return
    }
    res.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript')
    res.end(await readFile(file))
  } catch {
    res.writeHead(500)
    res.end()
  }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
let browser
try {
  browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    ignoreDefaultArgs: ['--force-color-profile=srgb'],
  })
  const page = await browser.newPage({ viewport: null })
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.waitForFunction(() => window.hdrReady !== undefined)
  const result = await page.evaluate(() => window.hdrReady)
  if (result.error) throw new Error(result.error)
  assert.equal(result.presentation.toneMapping.mode, 'extended')
  if (process.argv.includes('--gray')) assert(
    result.matchedValues.every((rgb) =>
      rgb.every((v, i) => Math.abs(v - result.values[3][i]) < 0.002),
    ),
    '同尺寸视频块与原高光数值不一致',
  )
  assert.equal(result.sdrPresentation.toneMapping.mode, 'standard')
  assert(
    result.sdrValues.flat().every((value) => value >= 0 && value <= 1),
    'SDR 对照超出范围',
  )
  // 确认刷新也能自行解码、绘制；不再依赖一次性的 evaluate 注入。
  if (process.argv.includes('--view')) {
    await page.reload()
    await page.waitForFunction(
      () =>
        document.querySelector('#status')?.dataset.state === 'ready' ||
        document.querySelector('#status')?.dataset.state === 'error',
    )
    const state = await page.locator('#status').getAttribute('data-state')
    assert.equal(state, 'ready', await page.locator('#status').textContent())
    assert.equal(await page.locator('canvas').count(), 6)
    await page.screenshot({ path: 'test-results/hdr/visible-comparison.png' })
    console.log('测试地址：http://127.0.0.1:' + server.address().port)
  }

  // 使用量化后的 Y 值独立计算 CPU 参考；仅覆盖中性灰夹具，不把电影任意像素当作灰阶。
  if (process.argv.includes('--gray')) {
    const expected = result.codes.map((y) => {
      const signal = (y - 64) / 876
      const p = signal ** (32 / 2523)
      const linear =
        (10000 / 203) *
        (Math.max(p - 3424 / 4096, 0) / (2413 / 128 - (2392 / 128) * p)) ** (16384 / 2610)
      return linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055
    })
    result.expected = expected
    for (let i = 0; i < 4; i++)
      for (const c of result.values[i])
        assert(
          Math.abs(c - expected[i]) < Math.max(0.0015, expected[i] * 0.005),
          'PQ 输出偏离数学参考',
        )
    if (new Set(result.codes).size === 4)
      assert.equal(new Set(result.values.map((v) => v[0])).size, 4, '相邻灰阶精度丢失')
  }
  if (process.argv.includes('--reference')) {
    const pq = (s) => {
      const p = Math.min(1, Math.max(0, s)) ** (32 / 2523)
      return (
        (10000 / 203) *
        (Math.max(p - 3424 / 4096, 0) / (2413 / 128 - (2392 / 128) * p)) ** (16384 / 2610)
      )
    }
    const srgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)
    result.expectedRGB = result.yuv.map(([Y, U, V]) => {
      const y = (Y - 64) / 876,
        u = (U - 512) / 896,
        v = (V - 512) / 896
      const [r, g, b] = [
        pq(y + 1.4746 * v),
        pq(y - 0.1645531268 * u - 0.5713531268 * v),
        pq(y + 1.8814 * u),
      ]
      return [
        1.660491 * r - 0.587641 * g - 0.07285 * b,
        -0.12455 * r + 1.1329 * g - 0.008349 * b,
        -0.018151 * r - 0.100579 * g + 1.11873 * b,
      ].map(srgb)
    })
    result.expectedRGB.forEach((rgb, i) =>
      rgb.forEach((expected, j) =>
        assert(
          Math.abs(expected - result.values[i][j]) < Math.max(0.002, Math.abs(expected) * 0.005),
          '色块偏离参考',
        ),
      ),
    )
  }
  console.log(JSON.stringify(result, null, 2))
  if (process.argv.includes('--view')) {
    console.log('HDR 对照页已打开，关闭测试窗口即可结束。')
    await new Promise((resolve) => page.once('close', resolve))
  }
} finally {
  await browser?.close()
  server.close()
}
