import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
/** 打包态人工验收入口。只替代选文件/弹幕网络，视频读取、解码、音频与 UI 均走正式链路。 */
import { _electron } from 'playwright-core'

const executablePath = process.env.MARCHEN_TEST_APP
const mediaFile = process.env.MARCHEN_TEST_FILE
if (!executablePath || !mediaFile)
  throw new Error('请设置 MARCHEN_TEST_APP（应用可执行文件）和 MARCHEN_TEST_FILE（mp4/mkv）')
const output = resolve(process.env.MARCHEN_TEST_EVIDENCE ?? 'test-results/compat-video-acceptance')
await mkdir(output, { recursive: true })
const profile = await mkdtemp(join(tmpdir(), 'marchen-compat-acceptance-'))
const app = await _electron.launch({
  executablePath,
  args: [`--user-data-dir=${profile}`],
  ignoreDefaultArgs: ['--force-color-profile=srgb'],
})
try {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.evaluate(() =>
    localStorage.setItem('marchen:player', JSON.stringify({ enginePreference: 'compat' })),
  )
  await page.reload()
  await page.route('**/match', (route) =>
    route.fulfill({
      json: {
        isMatched: true,
        matches: [{ episodeId: 1, animeId: 1, animeTitle: '本地验收', episodeTitle: '视频呈现' }],
      },
    }),
  )
  await page.route('**/comment/**', (route) => route.fulfill({ json: { count: 0, comments: [] } }))
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
  }, resolve(mediaFile))
  await page.getByText('点击或拖拽动漫到此处播放').click()
  await page.waitForFunction(
    () => document.querySelector('[data-player-compat-video]')?.readyState === 4,
  )
  await page.waitForTimeout(3000)
  await page.getByRole('button', { name: '暂停', exact: true }).click({ force: true })
  await page.waitForTimeout(1000)
  const state = await page.evaluate(() => {
    const video = document.querySelector('[data-player-compat-video]')
    const frame = new VideoFrame(video)
    const result = {
      isolated: crossOriginIsolated,
      hdrDisplayReported: matchMedia('(dynamic-range: high)').matches,
      mediaText: document.body.textContent,
      videoPaused: video.paused,
      width: video.videoWidth,
      height: video.videoHeight,
      color: frame.colorSpace.toJSON(),
      format: frame.format,
    }
    frame.close()
    return result
  })
  await page.screenshot({ path: join(output, 'paused.png') })
  await writeFile(join(output, 'state.json'), JSON.stringify(state, null, 2))
  console.log(`已停帧，检查 HDR 高光与字幕；证据位于 ${output}。关闭验收窗口结束。`)
  await new Promise((done) => page.on('close', done))
} finally {
  await app.close().catch(() => {})
}
