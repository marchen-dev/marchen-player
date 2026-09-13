import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, _electron } from 'playwright-core'
import { Input, BufferSource, ALL_FORMATS, EncodedPacketSink } from 'mediabunny'

// 独立呈现实验；只使用可公开的短夹具，不修改正式播放器。
const electron = process.argv.includes('--electron')
const view = process.argv.includes('--view')
const output = new URL('../../../test-results/hdr/video-stream/', import.meta.url)
await mkdir(output, { recursive: true })
const media = await readFile(new URL('../../../test-results/hdr/luminance.mp4', import.meta.url))
const input = new Input({ formats: ALL_FORMATS, source: new BufferSource(media) })
let fixture
try {
  const track = await input.getPrimaryVideoTrack()
  const config = await track.getDecoderConfig()
  const packets = []
  for await (const packet of new EncodedPacketSink(track).packets()) {
    packets.push({
      data: Array.from(packet.data),
      timestamp: Math.round(packet.timestamp * 1e6),
      duration: Math.round(packet.duration * 1e6),
      type: packet.type,
    })
    assert(packets.length <= 64, '本实验仅接受短夹具')
  }
  fixture = {
    config: { ...config, description: Array.from(new Uint8Array(config.description)) },
    packets,
  }
} finally {
  input.dispose()
}
const script = await readFile(new URL('./hdr-video-stream-page.js', import.meta.url))
const html = `<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><title>HDR：硬解帧直接送 video</title>
<style>body{background:#181818;color:#eee;font:15px system-ui;margin:24px}main{display:flex;gap:32px}video,canvas{display:block;width:512px;height:128px;background:#000}h1{font-size:22px}h2{font-size:16px;margin:14px 0 6px}p{max-width:980px}button{padding:8px 18px;margin-right:8px}pre{width:420px;max-height:560px;overflow:auto;font-size:12px}.labels{display:flex;width:512px}.labels span{width:25%;text-align:center}.white{background:white;width:64px;height:40px;margin-top:10px}</style>
<h1>同一份 HEVC Main10 / BT.2020 / PQ 夹具</h1>
<p>三排尺寸相同。上排原生 video；中排 WebCodecs 原始帧直接送 MediaStream；下排普通 2D Canvas 为 SDR 输出对照。夹具循环无声播放，仅用于颜色观察，不代表长视频或音画同步验收。</p>
<p id="status">正在解码并初始化……</p>
<button id="freeze">停止送帧（新方式）</button><button id="pause">video 暂停（旧方式）</button><button id="resume">继续</button><button id="capture">记录帧信息</button>
<main><section><h2>原生 video（参考，仍需确认本机 HDR）</h2><video id="native" src="/luminance.mp4" muted loop playsinline></video>
<h2>WebCodecs → MediaStream → video（实验）</h2><video id="streamed" muted playsinline></video>
<h2>WebCodecs → 普通 Canvas（SDR 对照）</h2><canvas id="canvas"></canvas>
<div class="labels"><span>100 nit</span><span>203 nit</span><span>400 nit</span><span>1000 nit</span></div><p>标注为源编码亮度，非屏幕实测亮度。</p><div class="white"></div><small>CSS 白色参考</small></section><pre id="diagnostic"></pre></main><script type="module" src="/page.js"></script></html>`
const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname
  if (path === '/luminance.mp4') {
    const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/)
    const start = range ? Number(range[1]) : 0
    const end = range && range[2] ? Math.min(Number(range[2]), media.length - 1) : media.length - 1
    if (start > end) {
      response.writeHead(416)
      response.end()
      return
    }
    response.writeHead(range ? 206 : 200, {
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${media.length}` } : {}),
    })
    response.end(media.subarray(start, end + 1))
  } else if (path === '/fixture.json') {
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify(fixture))
  } else if (path === '/page.js') {
    response.setHeader('Content-Type', 'text/javascript')
    response.end(script)
  } else if (path === '/') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end(html)
  } else {
    response.writeHead(404)
    response.end()
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}/`
let browser, app, temp
try {
  let page
  if (electron) {
    temp = await mkdtemp(join(tmpdir(), 'marchen-video-hdr-'))
    const entry = join(temp, 'main.cjs')
    await writeFile(
      entry,
      `const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const w=new BrowserWindow({width:1120,height:900,webPreferences:{backgroundThrottling:false}});w.loadURL('about:blank')});app.on('window-all-closed',()=>app.quit())`,
    )
    app = await _electron.launch({ args: [entry] })
    page = await app.firstWindow()
  } else {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: false,
      ignoreDefaultArgs: ['--force-color-profile=srgb'],
    })
    page = await (await browser.newContext({ viewport: null })).newPage()
  }
  const cdp = await page.context().newCDPSession(page)
  const properties = []
  cdp.on('Media.playerPropertiesChanged', ({ playerId, properties: values }) => {
    properties.push({
      playerId,
      values: values.filter(({ name }) => /decoder|platform|color|hdr|codec/i.test(name)),
    })
  })
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await cdp.send('Media.enable')
  await page.goto(url)
  await page.waitForFunction(() => window.hdrReady || window.hdrResult?.errors.length)
  assert(await page.evaluate(() => !!window.hdrReady), await page.locator('#status').textContent())
  await page.waitForTimeout(1500)
  const playing = await page.evaluate(() => window.captureHdrStage('稳定播放'))
  assert(playing.presented > 2, 'MediaStream video 没有持续呈现帧')
  await page.evaluate(() => window.pauseHdr())
  await page.waitForTimeout(700)
  await page.evaluate(() => window.captureHdrStage('暂停后'))
  await page.evaluate(() => window.resumeHdr())
  await page.waitForTimeout(1200)
  const resumed = await page.evaluate(() => window.captureHdrStage('恢复后'))
  assert(resumed.presented > playing.presented, '恢复后没有新呈现帧')
  await page.evaluate(() => window.freezeHdr())
  await page.waitForTimeout(1000)
  const frozen = await page.evaluate(() => window.captureHdrStage('停止送帧 1 秒'))
  await page.waitForTimeout(9000)
  const held = await page.evaluate(() => window.captureHdrStage('停止送帧 10 秒'))
  assert.equal(held.sent, frozen.sent, '停帧期间仍有写入')
  assert.equal(held.presented, frozen.presented, '排空后停帧期间仍在呈现新帧')
  assert.equal(held.paused, false, '停帧方式意外暂停了 video')
  assert.equal(held.streamed.colorSpace.transfer, 'pq', '停帧后 PQ 标签丢失')
  assert.equal(held.streamed.colorSpace.primaries, 'bt2020', '停帧后 BT.2020 标签丢失')
  assert.equal(held.streamed.format, resumed.streamed.format, '停帧后格式发生变化')
  await page.evaluate(() => window.resumeHdr())
  await page.waitForTimeout(1200)
  const afterHold = await page.evaluate(() => window.captureHdrStage('停止送帧后恢复'))
  assert(afterHold.presented > held.presented, '停帧恢复后没有呈现新帧')
  assert.equal(afterHold.streamed.colorSpace.transfer, 'pq')
  const result = {
    runtime: electron ? 'electron' : 'chrome',
    url,
    ...(await page.evaluate(() => window.hdrResult)),
    mediaProperties: properties,
    pageErrors: errors,
    scope: '短夹具呈现及帧标签；不证明屏幕亮度、10-bit 显示精度、音画同步或长播放性能',
  }
  await writeFile(new URL(`${result.runtime}-freeze.json`, output), JSON.stringify(result, null, 2))
  await page.screenshot({ path: new URL(`${result.runtime}-freeze.png`, output).pathname })
  // 页面刷新必须能自行重建，不能依赖自动化注入的一次性初始化。
  await page.reload()
  await page.waitForFunction(() => window.hdrReady)
  await page.waitForTimeout(1000)
  await page.evaluate(() => window.freezeHdr())
  await page.waitForTimeout(1000)
  await page.evaluate(() => window.captureHdrStage('保留窗口：停止送帧'))
  assert.equal(errors.length, 0, errors.join('\n'))
  console.log(JSON.stringify(result, null, 2))
  if (view) {
    console.log(`对照窗口已保留：${url}；关闭窗口结束实验。`)
    await new Promise((resolve) => page.on('close', resolve))
  }
} finally {
  await browser?.close()
  await app?.close()
  server.close()
  if (temp) await rm(temp, { recursive: true, force: true })
}
