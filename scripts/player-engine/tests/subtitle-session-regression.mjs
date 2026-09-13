/** 对独立 Electron 测试窗口执行：四次切换复用字幕资源和 Worker，退出释放。 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron } from 'playwright-core'

const file = process.env.MARCHEN_TEST_FILE
const url = process.env.MARCHEN_TEST_RENDERER_URL
if (!file || !url)
  throw new Error('请设置 MARCHEN_TEST_FILE 和已启动的 Electron 开发服务 MARCHEN_TEST_RENDERER_URL')
const root = `${resolve(process.env.MARCHEN_TEST_EVIDENCE ?? 'test-results/subtitle-session-regression')  }/`
await mkdir(root, { recursive: true })
const profile = await mkdtemp(join(tmpdir(), 'marchen-subtitle-session-'))
const app = await _electron.launch({
  args: [resolve('.'), `--user-data-dir=${profile}`],
  env: {
    ...process.env,
    NODE_ENV: 'development',
    MARCHEN_DEV_USER_DATA_DIR: profile,
    ELECTRON_RENDERER_URL: url,
  },
  ignoreDefaultArgs: ['--force-color-profile=srgb'],
})
try {
  const p = await app.firstWindow()
  await p.waitForURL(`${url.replace(/\/$/, '')}/**`)
  // 仅读取 React 宿主的真实 Runtime 来发出公开播放命令，不替换解码或字幕服务。
  const bind = () =>
    p.evaluate(() => {
      const element = document.querySelector('[data-player-root]')
      let fiber = element[Object.keys(element).find((key) => key.startsWith('__reactFiber'))]
      while (fiber) {
        if (fiber.memoizedProps?.runtime?.commands) {
          window.testRuntime = fiber.memoizedProps.runtime
          break
        }
        fiber = fiber.return
      }
    })
  await p.waitForLoadState('domcontentloaded')
  await p.evaluate(() =>
    localStorage.setItem('marchen:player', JSON.stringify({ enginePreference: 'compat' })),
  )
  await p.reload()
  await p.waitForLoadState('domcontentloaded')
  await p.evaluate(async () => {
    window.subtitleCounts = { workers: 0 }
    const W = window.Worker
    window.Worker = class extends W {
      constructor(...a) {
        super(...a)
        if (String(a[0]).includes('octopus')) window.subtitleCounts.workers++
      }
    }
  })
  await p.route('**/match', (r) =>
    r.fulfill({
      json: {
        isMatched: true,
        matches: [
          { episodeId: 1, animeId: 1, animeTitle: '本地字幕回归', episodeTitle: 'Ave Mujica 06' },
        ],
      },
    }),
  )
  await p.route('**/comment/**', (r) => r.fulfill({ json: { count: 0, comments: [] } }))
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, file)
  const start = Date.now()
  await p.getByText('点击或拖拽动漫到此处播放').click()
  await p.waitForFunction(
    () => document.querySelector('[data-player-compat-video]')?.readyState === 4,
  )
  await bind()
  await p.mouse.move(600, 400)
  await p.getByRole('button', { name: '设置', exact: true }).last().click({ force: true })
  await p.getByRole('tab', { name: '字幕', exact: true }).click()
  await p.waitForFunction(
    () => {
      const element = document.querySelector('[aria-label="字幕轨道"]')
      return element && !element.disabled && !element.textContent.includes('关闭字幕')
    },
    {},
    { timeout: 90000 },
  )
  const coldMs = Date.now() - start
  await p.evaluate(() => {
    const e = document.querySelector('[data-player-root]');
      let f = e[Object.keys(e).find((k) => k.startsWith('__reactFiber'))]
    while (f) {
      if (f.type?.name === 'NativeSubtitleProvider')
        window.savedAdapter = f.memoizedState.next.memoizedState.current
      f = f.return
    }
    window.savedCanvas = document.querySelector('[data-player-subtitle-surface] canvas')
    window.savedTrackRelease = window.savedAdapter.releaseTrack
    window.savedWorker = window.savedAdapter.instance.worker
    window.testRuntime.commands.pause()
    window.testRuntime.commands.seek(680.5)
  })
  await p.waitForTimeout(800)
  const baseline = await p.evaluate(() => ({ ...window.subtitleCounts }))
  assert.equal(baseline.workers, 1)
  const results = []
  for (const [label, engine] of [
    ['原生（H5）', 'native'],
    ['兼容内核', 'compat'],
    ['原生（H5）', 'native'],
    ['兼容内核', 'compat'],
  ]) {
    await p.getByRole('tab', { name: '播放', exact: true }).click()
    await p.getByRole('combobox').first().click()
    const since = Date.now()
    await p.getByRole('option', { name: label, exact: true }).click()
    await p.waitForFunction(
      (e) =>
        window.testRuntime.presentation?.engine === e && window.testRuntime.presentation.firstFrame,
      engine,
    )
    await p.waitForTimeout(500)
    const result = await p.evaluate(() => ({
      counts: { ...window.subtitleCounts },
      sameCanvas:
        window.savedCanvas === document.querySelector('[data-player-subtitle-surface] canvas'),
      sameWorker: window.savedWorker === window.savedAdapter.instance?.worker,
      sameTrack: window.savedTrackRelease === window.savedAdapter.releaseTrack,
      clock: window.testRuntime.clock.snapshot(),
    }))
    assert.deepEqual(result.counts, baseline)
    assert.equal(result.sameCanvas, true)
    assert.equal(result.sameWorker, true)
    assert.equal(result.sameTrack, true)
    results.push({ engine, switchMs: Date.now() - since, ...result })
  }
  await p.getByRole('tab', { name: '字幕', exact: true }).click()
  const text = await p.getByRole('combobox').textContent()
  await p.screenshot({ path: `${root  }subtitle-stable-switch.png` })
  const result = { coldMs, baseline, results, text }
  await writeFile(`${root  }subtitle-stable-switch.json`, JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
  await p.getByRole('button', { name: '关闭播放器设置', exact: true }).click()
  await p.getByRole('button', { name: '关闭当前播放', exact: true }).click()
  const release = await p.evaluate(() => ({
    disposed: window.savedAdapter.disposed,
    instance: !!window.savedAdapter.instance,
    canvasConnected: window.savedCanvas.isConnected,
  }))
  assert.deepEqual(release, { disposed: true, instance: false, canvasConnected: false })
  console.log('RELEASE', release)
  await writeFile(`${root  }subtitle-stable-release.json`, JSON.stringify(release, null, 2))
} finally {
  await app.close().catch(() => {})
  await rm(profile, { recursive: true, force: true })
}
