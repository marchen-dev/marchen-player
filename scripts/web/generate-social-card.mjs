import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

// 手动运行：node scripts/web/generate-social-card.mjs
// 默认使用本机 Chrome；其他环境通过 CHROME_EXECUTABLE_PATH 指定浏览器。
const asset = (path) => readFileSync(new URL(path, import.meta.url)).toString('base64')
const logo = asset('../../resources/icon.png')
const font = asset('../../node_modules/@fontsource/manrope/files/manrope-latin-600-normal.woff2')
const chineseFont = asset('../../src/renderer/src/styles/fonts/notoSansSC-medium.woff2')
const browser = await chromium.launch({
  channel: process.env.CHROME_EXECUTABLE_PATH ? undefined : 'chrome',
  executablePath: process.env.CHROME_EXECUTABLE_PATH,
  headless: true,
})
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  })
  await page.setContent(`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8" />
    <style>
      @font-face { font-family: Manrope; src: url(data:font/woff2;base64,${font}); font-weight: 600; }
      @font-face { font-family: NotoSansSC; src: url(data:font/woff2;base64,${chineseFont}); font-weight: 500; }
      * { box-sizing: border-box; }
      body { margin: 0; width: 1200px; height: 630px; background: #141414; color: #fafafa;
        font-family: Manrope, NotoSansSC, sans-serif; }
      main { height: 100%; padding: 68px 76px; position: relative; }
      header { display: flex; align-items: center; gap: 14px; color: #b0b0b0; font-size: 18px; }
      header img { width: 42px; height: 42px; }
      h1 { margin: 66px 0 14px; font-size: 76px; font-weight: 600; letter-spacing: -3px; }
      p { margin: 0; font-size: 32px; letter-spacing: 3px; color: #d4d4d4; }
      footer { position: absolute; bottom: 64px; left: 76px; right: 76px;
        border-top: 1px solid #383838; padding-top: 24px; display: flex;
        justify-content: space-between; color: #999; font-size: 18px; }
      .logo { position: absolute; width: 206px; height: 206px; right: 70px; top: 205px; }
    </style></head><body><main>
      <header><img src="data:image/png;base64,${logo}" />开源动漫弹幕播放器</header>
      <h1>Marchen Player</h1><p>本地视频 · 弹幕 · 字幕</p>
      <img class="logo" src="data:image/png;base64,${logo}" />
      <footer><span>Web / macOS / Windows</span><span>marchen-play.suemor.com</span></footer>
    </main></body></html>`)
  await page.evaluate(() => document.fonts.ready)
  await page
    .locator('img')
    .evaluateAll((images) => Promise.all(images.map((image) => image.decode())))
  await page.screenshot({
    path: fileURLToPath(new URL('../../src/renderer/public/og-image.png', import.meta.url)),
  })
} finally {
  await browser.close()
}
