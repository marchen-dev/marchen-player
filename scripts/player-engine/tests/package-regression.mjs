import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, open, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ALL_FORMATS, CustomSource, EncodedPacketSink, Input } from 'mediabunny'
import { chromium } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
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
    '--outfile=test-results/player-engine/hevc-decoder.mjs',
  ],
  { cwd: root, stdio: 'pipe' },
)
const packageSmoke = !process.argv.includes('--extended')
const packetCount = Number(process.argv[4] ?? (packageSmoke ? 60 : 180))
assert(
  Number.isInteger(packetCount) && packetCount >= 32 && packetCount <= 180,
  '包数应为 32 到 180',
)
const filename = process.argv[2]
if (!filename)
  throw new Error(
    '用法：node scripts/player-engine/tests/package-regression.mjs <本地 HEVC 文件> [开始秒数] [包数] [--extended]',
  )
const config = JSON.parse(
  await readFile(
    new URL('../../../node_modules/@suemor/libav-hevc/manifest.json', import.meta.url),
    'utf8',
  ),
)
const assetDir = join(root, 'src/renderer/public/wasm/libav', config.version)
const manifest = JSON.parse(await readFile(join(assetDir, 'manifest.json'), 'utf8'))
assert.deepEqual(manifest, config, '静态资源与已安装发布包不一致，请执行 media:prepare')
const handle = await open(filename, 'r')
let input, server, browser
try {
  const stat = await handle.stat()
  let bytesRead = 0
  input = new Input({
    formats: ALL_FORMATS,
    source: new CustomSource({
      getSize: () => stat.size,
      maxCacheSize: 8 * 1024 * 1024,
      read: async (start, end) => {
        const bytes = new Uint8Array(end - start)
        let offset = 0
        while (offset < bytes.length) {
          const result = await handle.read(bytes, offset, bytes.length - offset, start + offset)
          if (!result.bytesRead) throw new Error('文件读取提前结束')
          offset += result.bytesRead
        }
        bytesRead += offset
        return bytes
      },
    }),
  })
  const track = await input.getPrimaryVideoTrack()
  assert(track, '需要视频轨')
  assert.equal(await track.getCodec(), 'hevc')
  const decoderConfig = await track.getDecoderConfig()
  const sink = new EncodedPacketSink(track)
  const key = await sink.getKeyPacket(Number(process.argv[3] ?? 60))
  const packets = []
  for await (const packet of sink.packets(key ?? undefined)) {
    packets.push({
      data: Buffer.from(packet.data).toString('base64'),
      timestamp: packet.timestamp,
      duration: packet.duration,
      type: packet.type,
    })
    if (packets.length >= packetCount) break
  }
  assert.equal(packets.length, packetCount, '样片压缩包不足')
  const fixture = JSON.stringify({
    config: {
      ...decoderConfig,
      description: Array.from(new Uint8Array(decoderConfig.description ?? new ArrayBuffer(0))),
    },
    packets,
  })
  // 只监听本机，私有压缩包仅在内存提供，不写入仓库或远端。
  server = createServer(async (request, response) => {
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
    const pathname = new URL(request.url, 'http://localhost').pathname
    try {
      if (pathname === '/') {
        response.setHeader('Content-Type', 'text/html')
        return response.end('<!doctype html><title>HEVC 发布包接入回归</title>')
      }
      if (pathname === '/fixture.json') {
        response.setHeader('Content-Type', 'application/json')
        return response.end(fixture)
      }
      if (pathname === '/render-worker.js') {
        response.setHeader('Content-Type', 'text/javascript')
        return response.end(
          await readFile(join(root, 'scripts/player-engine/tests/render-worker.js')),
        )
      }
      if (pathname === '/lifecycle-worker.js') {
        response.setHeader('Content-Type', 'text/javascript')
        return response.end(
          await readFile(join(root, 'scripts/player-engine/tests/lifecycle-worker.js')),
        )
      }
      if (pathname === '/adapter.mjs' || pathname === '/adapter-worker.js') {
        response.setHeader('Content-Type', 'text/javascript')
        return response.end(
          await readFile(
            join(
              root,
              pathname === '/adapter.mjs'
                ? 'test-results/player-engine/hevc-decoder.mjs'
                : 'scripts/player-engine/tests/adapter-worker.js',
            ),
          ),
        )
      }
      const name = pathname.slice('/dist/'.length)
      if (!pathname.startsWith('/dist/') || !Object.hasOwn(manifest.files, name)) {
        response.writeHead(404)
        return response.end()
      }
      response.setHeader(
        'Content-Type',
        name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
      )
      response.end(await readFile(join(assetDir, name)))
    } catch {
      response.writeHead(500)
      response.end()
    }
  })
  await new Promise((resolveReady) => server.listen(0, '127.0.0.1', resolveReady))
  const port = server.address().port
  browser = await chromium.launch(
    process.env.MARCHEN_CHROME_PATH
      ? { executablePath: process.env.MARCHEN_CHROME_PATH, headless: true }
      : { channel: 'chrome', headless: true },
  )
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${port}`)
  const adapterResults = []
  for (const test of packageSmoke
    ? [{ threads: 1 }, { threads: 4 }]
    : [
        { threads: 1 },
        { threads: 4 },
        { threads: 4, annexB: true },
        { threads: 4, shift: 5000 },
        { threads: 4, shift: -60 },
        ...(decoderConfig.colorSpace?.transfer === 'pq' ||
        decoderConfig.colorSpace?.transfer === 'hlg'
          ? [{ threads: 4, render: true }]
          : []),
      ]) {
    const result = await page.evaluate(
      (test) =>
        new Promise((resolveResult) => {
          const worker = new Worker('/adapter-worker.js', { type: 'module' })
          const timer = setTimeout(() => {
            worker.terminate()
            resolveResult({ error: '适配器超时' })
          }, 60000)
          worker.onmessage = (event) => {
            clearTimeout(timer)
            worker.terminate()
            resolveResult(event.data)
          }
          worker.onerror = (event) => {
            clearTimeout(timer)
            worker.terminate()
            resolveResult({ error: event.message })
          }
          worker.postMessage(test)
        }),
      test,
    )
    assert(!result.error, result.error)
    assert.equal(result.diagnostics.mode, test.threads > 1 ? 'threads' : 'direct')
    assert(result.diagnostics.memory, '发布包内存诊断缺失')
    assert(result.diagnostics.memory.linearMemoryBytes <= manifest.maximumMemoryBytes)
    assert(
      result.diagnostics.memory.activePthreads + result.diagnostics.memory.idlePthreads <=
        manifest.pthreadPoolSize,
    )
    const reference = adapterResults[0]
    if (reference)
      assert.deepEqual(result.hashes, reference.hashes, 'MediaBunny VideoSample 像素不一致')
    assert(
      result.timestamps.every((value, index, array) => index === 0 || value >= array[index - 1]),
    )
    const expectedTimes = packets
      .map((packet) => packet.timestamp + (test.shift ?? 0))
      .sort((a, b) => a - b)
    assert.equal(result.timestamps.length, expectedTimes.length)
    result.timestamps.forEach((value, index) =>
      assert(Math.abs(value - expectedTimes[index]) < 0.000002, '帧时间戳偏移'),
    )
    assert(
      result.durations.every((duration) => duration > 0),
      '输出帧时长丢失',
    )
    if (test.render) assert.equal(result.rendered, 1, '真实 WASM 帧未经过 GPU 色彩转换')
    adapterResults.push({ ...test, ...result })
    console.log(`MediaBunny 适配器 ${JSON.stringify(test)}：${packetCount} 帧完整像素校验通过`)
  }
  const lifecycleResults = []
  for (const threads of packageSmoke ? [] : [1, 4]) {
    const result = await page.evaluate(
      (threads) =>
        new Promise((resolveResult) => {
          const worker = new Worker('/lifecycle-worker.js', { type: 'module' })
          const timer = setTimeout(() => {
            worker.terminate()
            resolveResult({ error: '生命周期验证超时' })
          }, 60000)
          worker.onmessage = (event) => {
            clearTimeout(timer)
            worker.terminate()
            resolveResult(event.data)
          }
          worker.onerror = (event) => {
            clearTimeout(timer)
            worker.terminate()
            resolveResult({ error: event.message })
          }
          worker.postMessage({ threads })
        }),
      threads,
    )
    assert(!result.error, result.error)
    assert.equal(result.rounds.length, 3)
    lifecycleResults.push({ threads, ...result })
    console.log(`真实 Worker ${threads} 线程：连续重建及取消通过`)
  }
  const renderResults = []
  for (const threads of packageSmoke ? [] : [1, 4]) {
    const result = await page.evaluate(
      (threads) =>
        new Promise((resolveResult) => {
          const worker = new Worker('/render-worker.js', { type: 'module' })
          const timer = setTimeout(() => {
            worker.terminate()
            resolveResult({ error: '呈现短测超时' })
          }, 60000)
          worker.onmessage = (event) => {
            clearTimeout(timer)
            worker.terminate()
            resolveResult(event.data)
          }
          worker.onerror = (event) => {
            clearTimeout(timer)
            worker.terminate()
            resolveResult({ error: event.message })
          }
          worker.postMessage({ threads })
        }),
      threads,
    )
    assert(!result.error, result.error)
    assert.equal(result.rendered + result.dropped, packetCount)
    renderResults.push(result)
    console.log(`GPU 呈现短测：${JSON.stringify(result)}`)
  }
  const output = join(
    root,
    `test-results/player-engine/${packageSmoke ? 'package-smoke' : 'package-regression'}.json`,
  )
  await mkdir(dirname(output), { recursive: true })
  await writeFile(
    output,
    JSON.stringify(
      {
        browser: browser.version(),
        build: manifest,
        bytesRead,
        adapterResults,
        lifecycleResults,
        renderResults,
        scope: '短片像素一致性；不代表长期内存、HDR 输出或完整播放验收',
      },
      null,
      2,
    ),
  )
  console.log(`回归结果：${output}`)
} finally {
  await browser?.close()
  if (server) await new Promise((resolveClosed) => server.close(resolveClosed))
  input?.dispose()
  await handle.close()
}
