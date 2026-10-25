import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

// 手动运行：node scripts/web/generate-favicons.mjs
// 以 public/favicon.svg 为唯一来源生成网页图标；桌面图标仍由 build/icon.svg 维护，两者互不影响。
// 默认使用本机 Chrome；其他环境通过 CHROME_EXECUTABLE_PATH 指定浏览器。

const publicDir = new URL('../../src/renderer/public/', import.meta.url)
const svg = readFileSync(new URL('favicon.svg', publicDir), 'utf8')
// iOS 会自行裁圆角，apple-touch-icon 需要不透明的直角方图
const squareSvg = svg.replace('rx="224" ', '')

const browser = await chromium.launch({
  channel: process.env.CHROME_EXECUTABLE_PATH ? undefined : 'chrome',
  executablePath: process.env.CHROME_EXECUTABLE_PATH,
  headless: true,
})

try {
  // 每个尺寸用独立页面渲染，复用页面缩小视口时截图会拿到旧布局
  const render = async (source, size) => {
    const page = await browser.newPage({ viewport: { width: size, height: size } })
    await page.setContent(
      `<!doctype html><html><head><style>
        html, body { margin: 0; background: transparent; }
        svg { display: block; width: ${size}px; height: ${size}px; }
      </style></head><body>${source}</body></html>`,
    )
    const image = await page.screenshot({ omitBackground: true })
    await page.close()
    return image
  }

  writeFileSync(new URL('icon-192.png', publicDir), await render(svg, 192))
  writeFileSync(new URL('apple-touch-icon.png', publicDir), await render(squareSvg, 180))

  // favicon.ico 兼容旧浏览器与直接请求 /favicon.ico 的爬虫，内嵌 16 / 32 / 48 三档 PNG
  const sizes = [16, 32, 48]
  const images = []
  for (const size of sizes) images.push(await render(svg, size))
  writeFileSync(new URL('favicon.ico', publicDir), toIco(sizes, images))
} finally {
  await browser.close()
}

function toIco(sizes, images) {
  const header = Buffer.alloc(6 + 16 * images.length)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach((image, index) => {
    const entry = 6 + 16 * index
    header.writeUInt8(sizes[index], entry)
    header.writeUInt8(sizes[index], entry + 1)
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(image.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += image.length
  })
  return Buffer.concat([header, ...images])
}
