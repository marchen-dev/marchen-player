// 连接独立开发实例；仅替代弹幕匹配结果，真实执行播放器、FFmpeg、Gateway 与 HLS。
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { basename, resolve } from 'node:path'
import { verifyV2Seek } from './electron-v2-seek-page.mjs'

const endpoint = process.env.MARCHEN_E2E_CDP ?? 'http://127.0.0.1:9223'
const fixture = resolve('test-results/media-compat/formal-app-hevc-eac3-timeline.mkv')
const output = resolve(
  process.env.MARCHEN_E2E_REPORT ?? 'test-results/media-compat/formal-app-v2-seek-e2e.json',
)
const pages = await fetch(`${endpoint}/json/list`).then((r) => r.json())
const page = pages.find((p) => p.type === 'page' && /^http:\/\/localhost:/.test(p.url))
if (!page) throw new Error('未找到独立 Electron 开发窗口')
const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }))
let id = 0
const pending = new Map()
const requests = []
const manifests = new Set()
const manifestReads = []
const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const current = ++id
    pending.set(current, { resolve, reject })
    socket.send(JSON.stringify({ id: current, method, params }))
  })
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id) {
    const request = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) request?.reject(new Error(JSON.stringify(message.error)))
    else request?.resolve(message.result)
  }
  if (message.method === 'Network.responseReceived') {
    const response = message.params.response
    if (response.url.includes('/v2/media/') && response.url.endsWith('/index.m3u8'))
      manifests.add(message.params.requestId)
    if (response.url.includes('/v2/media/'))
      requests.push({
        path: new URL(response.url).pathname.replace(/\/media\/[^/]+/, '/media/<token>'),
        status: response.status,
      })
  }
  if (message.method === 'Network.loadingFinished' && manifests.has(message.params.requestId))
    manifestReads.push(call('Network.getResponseBody', { requestId: message.params.requestId }))
})
let focusTimer
try {
  await call('Page.enable')
  await call('Page.bringToFront')
  await call('Network.enable')
  // macOS 把被遮挡窗口标为 hidden 时 rVFC 会停止，测试可显式维持自己实例的前台状态。
  const pid = Number(process.env.MARCHEN_E2E_PID)
  if (process.platform === 'darwin' && Number.isSafeInteger(pid) && pid > 0) {
    focusTimer = setInterval(
      () =>
        execFile(
          'osascript',
          [
            '-e',
            `tell application "System Events" to set frontmost of first process whose unix id is ${pid} to true`,
          ],
          () => {},
        ),
      400,
    )
  }
  const result = await call('Runtime.evaluate', {
    expression: `(${verifyV2Seek.toString()})(${JSON.stringify(fixture)})`,
    awaitPromise: true,
    returnByValue: true,
  })
  const versions = await call('Runtime.evaluate', {
    expression: 'window.electron.process.versions',
    returnByValue: true,
  })
  const hls = JSON.parse(
    await readFile(resolve('node_modules/hls.js/package.json'), 'utf8'),
  ).version
  const bodies = await Promise.all(manifestReads)
  const manifest = bodies[0]?.base64Encoded
    ? Buffer.from(bodies[0].body, 'base64').toString('utf8')
    : (bodies[0]?.body ?? '')
  const durations = [...manifest.matchAll(/#EXTINF:([\d.]+)/g)].map((m) => Number(m[1]))
  const manifestDuration = durations.reduce((a, b) => a + b, 0)
  const targetRequests = [8, 100, 117, 1, 12].map((target) => {
    let end = 0
    const index = durations.findIndex((duration) => {
      end += duration
      return target < end
    })
    return {
      target,
      index,
      requested: requests.some(
        (r) => r.status === 200 && r.path.endsWith(`/segments/${index}.m4s`),
      ),
    }
  })
  const metadata = JSON.parse(
    await readFile(
      resolve('resources/ffmpeg', `${process.platform}-${process.arch}`, 'runtime-metadata.json'),
      'utf8',
    ),
  )
  const timelinePassed =
    manifest.includes('#EXT-X-PLAYLIST-TYPE:VOD') &&
    manifest.includes('#EXT-X-ENDLIST') &&
    Math.abs(manifestDuration - 120) < 0.15 &&
    targetRequests.every((r) => r.requested)
  const report = {
    scope: 'real-development-app; danmaku match adapter returns no match; media pipeline real',
    fixture: basename(fixture),
    versions: versions.result?.value,
    hls,
    ffmpeg: metadata.ffmpegRelease,
    manifestDuration,
    segmentDurations: durations,
    targetRequests,
    timelinePassed,
    requests,
    result: result.result?.value ?? result.exceptionDetails,
  }
  await mkdir(resolve('test-results/media-compat'), { recursive: true })
  await writeFile(output, JSON.stringify(report, null, 2))
  if (!report.result?.ok || !timelinePassed)
    throw new Error(`v2 seek 未通过，见 ${basename(output)}`)
  console.log(`v2 seek 通过：${report.result.steps.length} 个目标，报告 ${basename(output)}`)
} finally {
  if (focusTimer) clearInterval(focusTimer)
  socket.close()
}
