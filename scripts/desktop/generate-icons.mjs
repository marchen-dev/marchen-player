import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

// 在 macOS 上运行：node scripts/desktop/generate-icons.mjs
// build/icon.svg 是全平台图标的源文件；网页与移动端只调整底板和安全区。
// 完成后依次运行 scripts/web/generate-favicons.mjs 与 scripts/web/generate-social-card.mjs。
const root = fileURLToPath(new URL('../../', import.meta.url))
const source = readFileSync(path.join(root, 'build/icon.svg'), 'utf8')
const temporary = mkdtempSync(path.join(tmpdir(), 'marchen-icon-'))
const iconset = path.join(temporary, 'Marchen.iconset')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } })
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block}</style>${source}`,
  )
  const png = path.join(root, 'resources/icon.png')
  await page.screenshot({ path: png, omitBackground: true })
  mkdirSync(iconset)
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const output = path.join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`)
      execFileSync('sips', ['-z', String(size * scale), String(size * scale), png, '--out', output])
    }
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(root, 'build/icon.icns')])
  const render = async (svg, size) => {
    const target = await browser.newPage({ viewport: { width: size, height: size } })
    try {
      await target.setContent(
        `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
      )
      return await target.screenshot({ omitBackground: true })
    } finally {
      await target.close()
    }
  }
  writeFileSync(path.join(root, 'build/icon.png'), readFileSync(png))
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512]
  const images = new Map()
  for (const size of sizes) {
    const image = await render(source, size)
    images.set(size, image)
    writeFileSync(path.join(root, `build/icons/${size}x${size}.png`), image)
  }
  const icoSizes = [16, 24, 32, 48, 64, 128, 256]
  writeFileSync(
    path.join(root, 'build/icon.ico'),
    toIco(
      icoSizes,
      icoSizes.map((size) => images.get(size)),
    ),
  )
  const mark = source.match(/<g fill="#0783ff"[\s\S]*?<\/g>/)?.[0]
  if (!mark) throw new Error('找不到猫耳标志')
  const svg = (content) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${content}</svg>`
  // 浏览器标签页只有 16px：不带白色底板，猫耳铺满画布（视口裁到标志外框，与 LogoMark 一致）。
  // 带底板时浅色标签栏上底板不可见、标志只剩六成大，深色标签栏上又多出一块白方块。
  // 弹幕线外圈间隙用遮罩镂空，深色标签栏上不会出现白边；播放三角保持白色，与应用图标一致。
  // 主屏幕图标（icon-192、apple-touch-icon）仍需底板，由网页生成脚本在此基础上加回。
  const markPaths = [...mark.matchAll(/<path[^>]+\/>/g)].map(([value]) => value)
  const markBody = markPaths[0]
  const markGap = markPaths.find((value) => value.includes('stroke="white"'))
  const markLine = markPaths.find((value) => value.includes('stroke="#0783ff"'))
  const markTriangle = markPaths.find((value) => value.includes('fill="white"'))
  if (!markBody || !markGap || !markLine || !markTriangle) throw new Error('猫耳标志结构已变化')
  const favicon = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="221 217 590 590"><defs><mask id="gap" maskUnits="userSpaceOnUse" x="221" y="217" width="590" height="590"><rect x="221" y="217" width="590" height="590" fill="white"/>${markGap.replace('"white"', '"black"')}${markLine.replace('"#0783ff"', '"white"')}</mask></defs><g mask="url(#gap)" fill="#0783ff">${markBody}${markLine}</g>${markTriangle}</svg>`
  writeFileSync(path.join(root, 'src/renderer/public/favicon.svg'), favicon)
  const mobile = path.join(root, 'apps/mobile/assets')
  if (existsSync(mobile)) {
    const square = svg(`<rect width="1024" height="1024" fill="white"/>${mark}`)
    writeFileSync(path.join(mobile, 'images/icon.png'), await render(square, 1024))
    // 镂空用遮罩表示，适配 Android 的背景层和系统单色图标。
    const transform = mark.match(/transform="([^"]+)"/)?.[1] ?? ''
    const paths = [...mark.matchAll(/<path[^>]+\/>/g)].map(([value]) => value)
    const holes = paths
      .filter((value) => value.includes('"white"'))
      .join('')
      .replaceAll('"white"', '"black"')
    const strokes = paths.find((value) => value.includes('stroke="#0783ff"'))
    const transparent = `<defs><mask id="holes" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><rect width="1024" height="1024" fill="white"/><g transform="${transform}">${holes}</g></mask></defs><g mask="url(#holes)"><g fill="#0783ff" transform="${transform}">${paths[0]}</g></g><g transform="${transform}">${strokes}</g>`
    // 自适应图标前景缩进安全区，由系统负责外轮廓裁切。
    const adaptive = svg(
      `<g transform="translate(512 512) scale(.78) translate(-512 -512)">${transparent}</g>`,
    )
    writeFileSync(
      path.join(mobile, 'images/android-icon-foreground.png'),
      await render(adaptive, 1024),
    )
    writeFileSync(
      path.join(mobile, 'images/android-icon-monochrome.png'),
      await render(adaptive.replaceAll('#0783ff', '#000000'), 1024),
    )
    writeFileSync(
      path.join(mobile, 'images/android-icon-background.png'),
      await render(svg('<rect width="1024" height="1024" fill="white"/>'), 1024),
    )
    writeFileSync(
      path.join(mobile, 'images/splash-icon.png'),
      await render(svg(transparent.replaceAll('#0783ff', '#ffffff')), 1024),
    )
    const composer = path.join(mobile, 'expo.icon')
    writeFileSync(path.join(composer, 'Assets/marchen.svg'), svg(transparent))
    const config = JSON.parse(readFileSync(path.join(composer, 'icon.json'), 'utf8'))
    config.fill = { 'automatic-gradient': 'extended-srgb:1.00000,1.00000,1.00000,1.00000' }
    config.groups[0].translucency = { enabled: false, value: 0 }
    config.groups[0].layers = [{ 'image-name': 'marchen.svg', name: 'Marchen' }]
    writeFileSync(path.join(composer, 'icon.json'), `${JSON.stringify(config, null, 2)}\n`)
  }
} finally {
  await browser.close()
  rmSync(temporary, { recursive: true, force: true })
}

function toIco(sizes, images) {
  const header = Buffer.alloc(6 + 16 * images.length)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach((image, index) => {
    const entry = 6 + 16 * index
    header.writeUInt8(sizes[index] === 256 ? 0 : sizes[index], entry)
    header.writeUInt8(sizes[index] === 256 ? 0 : sizes[index], entry + 1)
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(image.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += image.length
  })
  return Buffer.concat([header, ...images])
}
