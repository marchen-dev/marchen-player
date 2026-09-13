import { createServer } from 'vite'
import { _electron } from 'playwright-core'
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../../', import.meta.url).pathname)
const server = await createServer({
  configFile: false,
  root,
  publicDir: resolve(root, 'src/renderer/public'),
  server: {
    host: '127.0.0.1',
    port: 0,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  optimizeDeps: {
    entries: ['scripts/player-engine/experiments/real-video.html'],
    include: [
      'mediabunny',
      'rxjs',
      '@mediabunny/ac3',
      '@mediabunny/dts',
      '@soundtouchjs/audio-worklet',
    ],
  },
})
await server.listen()
const url = `${server.resolvedUrls.local[0]}scripts/player-engine/experiments/real-video.html`
const temp = await mkdtemp(join(tmpdir(), 'marchen-real-video-'))
const entry = join(temp, 'main.cjs')
await writeFile(
  entry,
  `const {app,BrowserWindow}=require('electron');app.commandLine.removeSwitch('force-color-profile');app.whenReady().then(()=>{const w=new BrowserWindow({width:1280,height:980,webPreferences:{backgroundThrottling:false}});w.loadURL('about:blank')});app.on('window-all-closed',()=>app.quit())`,
)
let app
try {
  app = await _electron.launch({ args: [entry] })
  const page = await app.firstWindow()
  const errors = []
  page.on('pageerror', (error) => {
    errors.push(String(error))
    console.error(String(error))
  })
  await page.goto(url)
  await page.waitForFunction(() => !!window.realExperiment)
  console.log(`真实文件实验页：${url}`)
  const file = process.argv.slice(2).find((arg) => !arg.startsWith('--'))
  if (file) {
    if (process.argv.includes('--software')) await page.locator('#software').check()
    await page.locator('#file').setInputFiles(resolve(file))
    await page.waitForFunction(
      () =>
        window.realExperiment.diagnostic().snapshot?.currentTime > 2 ||
        window.realExperiment.diagnostic().errors?.length,
      null,
      { timeout: 120000 },
    )
    let state = await page.evaluate(() => window.realExperiment.diagnostic())
    assert.equal(state.errors.length, 0, JSON.stringify(state.errors))
    const stages = [{ label: '初始播放', ...state }]
    if (process.argv.includes('--check')) {
      await page.waitForTimeout(10000)
      stages.push({
        label: '连续播放',
        ...(await page.evaluate(() => window.realExperiment.diagnostic())),
      })
      await page.evaluate(() => window.realExperiment.pause())
      await page.waitForTimeout(1000)
      const paused = await page.evaluate(() => window.realExperiment.diagnostic())
      await page.waitForTimeout(3000)
      state = await page.evaluate(() => window.realExperiment.diagnostic())
      assert.equal(state.snapshot.currentTime, paused.snapshot.currentTime, '暂停期间媒体时间推进')
      assert.equal(state.rendering.submitted, paused.rendering.submitted, '暂停后仍送帧')
      stages.push({ label: '暂停 4 秒', ...state })
      const target = Math.min(60, state.snapshot.duration / 2)
      await page.evaluate((time) => window.realExperiment.seek(time), target)
      await page.waitForFunction(() => !window.realExperiment.diagnostic().snapshot.seeking, null, {
        timeout: 60000,
      })
      await page.waitForTimeout(500)
      state = await page.evaluate(() => window.realExperiment.diagnostic())
      assert(Math.abs(state.snapshot.currentTime - target) < 0.2)
      stages.push({ label: '暂停中跳转', ...state })
      await page.evaluate(() => window.realExperiment.play())
      await page.waitForTimeout(2500)
      await page.evaluate(() => window.realExperiment.rate(1.5))
      await page.waitForTimeout(5000)
      state = await page.evaluate(() => window.realExperiment.diagnostic())
      assert.equal(state.snapshot.rate, 1.5)
      assert(state.snapshot.currentTime > target + 2, '恢复后时钟未推进')
      stages.push({ label: '1.5 倍速', ...state })
      await page.evaluate(() => window.realExperiment.rate(1))
      await page.waitForTimeout(2500)
    }
    await mkdir(resolve(root, 'test-results/real-video'), { recursive: true })
    await writeFile(
      resolve(
        root,
        `test-results/real-video/${process.argv.includes('--software') ? 'software' : 'default'}.json`,
      ),
      JSON.stringify({ stages, errors, url }, null, 2),
    )
    console.log(
      JSON.stringify({
        backend: state.decoding.backend,
        errors,
        checks: stages.map(({ label }) => label),
      }),
    )
  }
  console.log('窗口已保留，关闭窗口结束实验。')
  await new Promise((done) => page.on('close', done))
} finally {
  await app?.close()
  await server.close()
  await rm(temp, { recursive: true, force: true })
}
