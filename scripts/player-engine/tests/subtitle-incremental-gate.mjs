import { mkdir, readFile, writeFile } from 'node:fs/promises'
/** 使用实际 libass Worker 验证增量事件；独立于播放器，不修改依赖或生产入口。 */
import { createServer } from 'node:http'
import { extname, resolve } from 'node:path'
import { chromium } from 'playwright-core'

const output = resolve(process.env.MARCHEN_TEST_EVIDENCE ?? '.tmp/subtitle-incremental')
await mkdir(output, { recursive: true })
const assets = resolve('node_modules/@jellyfin/libass-wasm/dist/js')
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname
  try {
    if (path === '/') {
      res.setHeader('Content-Type', 'text/html')
      res.end(
        '<meta charset="utf-8"><style>body{background:#222;color:white}canvas{width:640px;height:360px;background:#000}</style><p>完整轨道 / 增量轨道</p><canvas id="full" width="640" height="360"></canvas><canvas id="incremental" width="640" height="360"></canvas><script src="/subtitles-octopus.js"></script>',
      )
      return
    }
    if (!/^\/[\w.-]+$/.test(path)) {
      res.writeHead(404).end()
      return
    }
    const types = { '.js': 'text/javascript', '.wasm': 'application/wasm', '.woff2': 'font/woff2' }
    res.setHeader('Content-Type', types[extname(path)] ?? 'application/octet-stream')
    res.end(await readFile(resolve(assets, path.slice(1))))
  } catch {
    res.writeHead(404).end()
  }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1320, height: 430 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => {
  if (m.type() === 'error') console.log('BROWSER', m.text())
})
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  await page.evaluate(async () => {
    window.header = `[Script Info]\nScriptType: v4.00+\nPlayResX: 640\nPlayResY: 360\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,32,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,20,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`
    window.lines = [
      'Dialogue: 0,0:00:01.00,0:00:10.00,Default,,0,0,0,,First subtitle',
      'Dialogue: 1,0:00:03.00,0:00:08.00,Default,,0,0,0,,{\\an8\\t(0,1000,\\fs44)}Animated overlap',
      'Dialogue: 0,0:00:12.00,0:00:16.00,Default,,0,0,0,,Last subtitle',
    ]
    window.instances = {}
    for (const id of ['full', 'incremental']) {
      await new Promise((done, fail) => {
        const timer = setTimeout(() => fail(new Error(`Worker 初始化超时: ${  id}`)), 15000)
        window.instances[id] = new globalThis.SubtitlesOctopus({
          canvas: document.getElementById(id),
          subContent: window.header + (id === 'full' ? window.lines.join('\n') : ''),
          workerUrl: '/subtitles-octopus-worker.js',
          legacyWorkerUrl: '/subtitles-octopus-worker-legacy.js',
          fallbackFont: '/default.woff2',
          fonts: ['/default.woff2'],
          onReady: () => {
            clearTimeout(timer)
            done()
          },
          onError: fail,
        })
      })
      window.instances[id].resize(640, 360)
      window.instances[id].setIsPaused(true, 0)
    }
    window.events = (id) => new Promise((r, j) => window.instances[id].getEvents(r, j))
    window.styles = (id) => new Promise((r, j) => window.instances[id].getStyles(r, j))
    window.frame = async (time) => {
      for (const instance of Object.values(window.instances)) instance.setCurrentTime(time)
      await new Promise((r) => setTimeout(r, 350))
      const pixels = (id) => [
        ...document.getElementById(id).getContext('2d').getImageData(0, 0, 640, 360).data,
      ]
      const a = pixels('full');
        const b = pixels('incremental')
      return {
        time,
        differentChannels: a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0),
        fullInk: a.filter((v, i) => i % 4 === 3 && v > 0).length,
        incrementalInk: b.filter((v, i) => i % 4 === 3 && v > 0).length,
      }
    }
  })
  await page.exposeFunction('captureGate', async (name) =>
    page.screenshot({ path: `${output}/${name}.png` }),
  )
  const result = await page.evaluate(async () => {
    const original = await window.events('full')
    const styles = await window.styles('full')
    const samples = []
    const add = (event) => {
      const { _index, ...value } = event
      window.instances.incremental.createEvent(value)
    }
    // 在相同时间点先渲染空轨道，再追加当前事件，验证不会依赖下一次 seek。
    samples.push({ phase: 'before-append', ...(await window.frame(2)) })
    for (const e of original.slice(0, 2)) add(e)
    const appended = await window.events('incremental')
    samples.push({ phase: 'append-current', ...(await window.frame(2)) })
    samples.push({ phase: 'animation', ...(await window.frame(3.5)) })
    add(original[2])
    await window.events('incremental')
    samples.push({ phase: 'append-later', ...(await window.frame(13)) })
    window.instances.incremental.removeEvent(0)
    const removed = await window.events('incremental')
    samples.push({ phase: 'removed-expected-empty', ...(await window.frame(2.5)) })
    await window.captureGate('removed-event')
    add(original[0])
    const restored = await window.events('incremental')
    samples.push({ phase: 'restore-and-seek-back', ...(await window.frame(3.5)) })
    await window.captureGate('duplicate-after-seek')
    // 对照一次明确的窗口重建，区别事件删除失败与时钟/字体差异。
    window.instances.incremental.freeTrack()
    window.instances.incremental.setTrack(window.header + window.lines.join('\n'))
    await window.events('incremental')
    samples.push({ phase: 'explicit-track-rebuild', ...(await window.frame(3.5)) })
    return { original, styles, appended, removed, restored, samples }
  })
  await page.screenshot({ path: `${output}/gate-comparison.png` })
  const failed = result.samples.filter((s) =>
    s.phase === 'removed-expected-empty'
      ? s.incrementalInk !== 0
      : s.phase !== 'before-append' && s.differentChannels !== 0,
  )
  await writeFile(
    `${output}/gate.json`,
    JSON.stringify(
      {
        dependency: '@jellyfin/libass-wasm@4.2.4',
        ...result,
        errors,
        passed: failed.length === 0 && errors.length === 0,
      },
      null,
      2,
    ),
  )
  if (failed.length || errors.length) process.exitCode = 1
  console.log(JSON.stringify({ samples: result.samples, removed: result.removed, errors }, null, 2))
  await page.evaluate(() => Object.values(window.instances).forEach((i) => i.dispose()))
} finally {
  await browser.close()
  await new Promise((r) => server.close(r))
}
