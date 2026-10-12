import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

// 手动运行：node scripts/docs/generate-readme-hero.mjs [输出文件名]
// 将 docs/images 中的真实窗口截图合成为 README 首图，不绘制任何虚构界面。
// 源图用 macOS「⌘⇧4 → 空格 → 按住 Option 点击窗口」截取：透明圆角、不含系统阴影。
// 默认输出 JPEG：画面以截图和渐变为主，PNG 体积会超过 2MB。
// 默认使用本机 Chrome；其他环境通过 CHROME_EXECUTABLE_PATH 指定浏览器。
const output = process.argv[2] || 'hero.jpg'
const asset = (path) => readFileSync(new URL(path, import.meta.url)).toString('base64')

const library = asset('../../docs/images/hero-source-library-light.png')
const playback = asset('../../docs/images/hero-source-playback.png')

// 以 CSS 像素描述版式，2 倍设备像素比输出 2400×1350。
const CANVAS = { width: 1200, height: 675 }

const browser = await chromium.launch({
  channel: process.env.CHROME_EXECUTABLE_PATH ? undefined : 'chrome',
  executablePath: process.env.CHROME_EXECUTABLE_PATH,
  headless: true,
})
try {
  const page = await browser.newPage({ viewport: CANVAS, deviceScaleFactor: 2 })
  await page.setContent(`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8" />
    <style>
      body { margin: 0; width: ${CANVAS.width}px; height: ${CANVAS.height}px; overflow: hidden;
        position: relative; background: #f3f5fb; }
      /* 浅色背景：应用主色蓝与播放画面的粉色淡化后做大面积柔和渐变，衬托白色窗口 */
      .bg { position: absolute; inset: 0;
        background:
          radial-gradient(55% 70% at 8% 0%, #d6e4ff 0%, transparent 70%),
          radial-gradient(50% 65% at 100% 100%, #ffdcea 0%, transparent 70%),
          radial-gradient(40% 50% at 92% 8%, #e8e2ff 0%, transparent 70%),
          linear-gradient(135deg, #eef3ff 0%, #f7f4fb 55%, #fdf1f5 100%); }
      /* 细颗粒噪点，避免大面积渐变出现色带 */
      .grain { position: absolute; inset: 0; opacity: .14; mix-blend-mode: soft-light;
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"); }
      /* 截图自带透明圆角，用 drop-shadow 沿 alpha 边缘投影；首层细描边让白色窗口与浅背景分开 */
      .window { position: absolute; display: block;
        filter: drop-shadow(0 0 .5px rgba(0,0,0,.28)) drop-shadow(0 24px 40px rgba(40,50,100,.22))
          drop-shadow(0 8px 14px rgba(0,0,0,.10)); }
      .library { left: 56px; top: 36px; width: 760px; }
      /* 播放窗口顶边须落在影视库番剧名下方，避免遮住标题 */
      .playback { right: 52px; bottom: 36px; width: 740px; }
    </style></head><body>
      <div class="bg"></div><div class="grain"></div>
      <img class="window library" src="data:image/png;base64,${library}" />
      <img class="window playback" src="data:image/png;base64,${playback}" />
    </body></html>`)
  await page
    .locator('img')
    .evaluateAll((images) => Promise.all(images.map((image) => image.decode())))
  await page.screenshot({
    path: fileURLToPath(new URL(`../../docs/images/${output}`, import.meta.url)),
    ...(output.endsWith('.png') ? {} : { type: 'jpeg', quality: 90 }),
  })
} finally {
  await browser.close()
}
