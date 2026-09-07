import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'

const referenceFfmpeg = process.env.MARCHEN_REFERENCE_FFMPEG ?? 'ffmpeg'
const filters = execFileSync(referenceFfmpeg, ['-hide_banner', '-filters'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
})
assert(
  /\bzscale\b/.test(filters) && /\btonemap\b/.test(filters),
  '参考 FFmpeg 必须包含 zscale 和 tonemap；可用 MARCHEN_REFERENCE_FFMPEG 指定，勿将缺失参考判为色彩通过',
)
const output = resolve('test-results/player-engine/color')
await mkdir(output, { recursive: true })
execFileSync('pnpm', [
  'exec',
  'esbuild',
  'src/renderer/src/services/media/render/hdr-sdr.ts',
  '--bundle',
  '--format=esm',
  '--platform=browser',
  '--loader:.frag=text',
  `--outfile=${output}/renderer.mjs`,
])
const patches = [
  [64, 512, 512],
  [128, 512, 512],
  [256, 512, 512],
  [384, 512, 512],
  [512, 512, 512],
  [640, 512, 512],
  [768, 512, 512],
  [876, 512, 512],
  [940, 512, 512],
  [512, 600, 400],
  [700, 350, 650],
]
const width = patches.length * 16
const height = 16
const planeSize = width * height
const values = new Uint16Array((planeSize * 3) / 2)
for (let y = 0; y < height; y++)
  for (let x = 0; x < width; x++) values[y * width + x] = patches[Math.floor(x / 16)][0]
for (let p = 1; p < 3; p++)
  for (let y = 0; y < height / 2; y++)
    for (let x = 0; x < width / 2; x++)
      values[planeSize + ((p - 1) * planeSize) / 4 + (y * width) / 2 + x] =
        patches[Math.floor(x / 8)][p]
const input = `${output}/patches.yuv`
await writeFile(input, new Uint8Array(values.buffer))
const server = createServer(async (req, res) => {
  res.setHeader('Content-Type', req.url === '/renderer.mjs' ? 'text/javascript' : 'text/html')
  res.end(
    req.url === '/renderer.mjs'
      ? await readFile(`${output}/renderer.mjs`)
      : '<!doctype html><title>色彩关口</title>',
  )
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
let browser
const results = []
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  for (const test of ['pq', 'hlg'].flatMap((transfer) =>
    [8, 10].flatMap((bitDepth) =>
      [false, true].map((fullRange) => ({ transfer, bitDepth, fullRange })),
    ),
  )) {
    const { transfer, bitDepth, fullRange } = test
    const sampleValues =
      bitDepth === 10 ? values : Uint8Array.from(values, (value) => Math.round(value / 4))
    await writeFile(input, new Uint8Array(sampleValues.buffer))
    const renderWidth = fullRange ? width - 32 : width

    const raw = `${output}/${transfer}.rgb`
    const filter = `zscale=tin=${transfer === 'pq' ? 'smpte2084' : 'arib-std-b67'}:pin=bt2020:min=bt2020nc:rin=${fullRange ? 'full' : 'limited'}:t=linear:npl=100:p=bt2020:m=gbr:r=full,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0:peak=10,zscale=t=iec61966-2-1:r=full,format=rgb24`
    execFileSync(referenceFfmpeg, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'rawvideo',
      '-pixel_format',
      bitDepth === 10 ? 'yuv420p10le' : 'yuv420p',
      '-video_size',
      `${width}x${height}`,
      '-i',
      input,
      '-frames:v',
      '1',
      '-vf',
      filter,
      '-f',
      'rawvideo',
      '-y',
      raw,
    ])
    // zimg 3.0.6 的 HLG 是逐通道近似；用独立 BT.2100 实现生成正确 OOTF 后再交给 FFmpeg。
    if (transfer === 'hlg') {
      const linear = `${output}/hlg-linear.gbr`
      execFileSync(
        process.env.MARCHEN_REFERENCE_PYTHON ?? '.cache/player-color-reference/bin/python',
        [
          'scripts/player-engine/tests/hlg-reference.py',
          input,
          linear,
          String(width),
          String(height),
          String(bitDepth),
          fullRange ? 'full' : 'limited',
        ],
      )
      execFileSync(referenceFfmpeg, [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'rawvideo',
        '-pixel_format',
        'gbrpf32le',
        '-video_size',
        `${width}x${height}`,
        '-i',
        linear,
        '-frames:v',
        '1',
        '-vf',
        'tonemap=hable:desat=0:peak=10,zscale=pin=bt709:min=gbr:tin=linear:rin=full:p=bt709:m=gbr:t=iec61966-2-1:r=full,format=rgb24',
        '-f',
        'rawvideo',
        '-y',
        raw,
      ])
    }
    const reference = await readFile(raw)
    const outputFrame = await page.evaluate(
      async ({ width, height, values, transfer, bitDepth, fullRange, renderWidth, reference }) => {
        const { HdrSdrRenderer } = await import('/renderer.mjs')
        const canvas = new OffscreenCanvas(renderWidth, height)
        const renderer = new HdrSdrRenderer(canvas)
        const size = width * height
        const bytes = bitDepth === 10 ? 2 : 1
        try {
          renderer.draw({
            data:
              bitDepth === 10
                ? new Uint8Array(new Uint16Array(values).buffer)
                : new Uint8Array(values),
            layout: [
              { offset: 0, stride: width * bytes },
              { offset: size * bytes, stride: (width / 2) * bytes },
              { offset: (size + size / 4) * bytes, stride: (width / 2) * bytes },
            ],
            width,
            height,
            bitDepth,
            visibleRect: { left: fullRange ? 16 : 0, top: 0, width: renderWidth, height },
            colorSpace: { primaries: 'bt2020', matrix: 'bt2020-ncl', transfer, fullRange },
          })
          const gl = canvas.getContext('webgl2')
          const pixels = new Uint8Array(renderWidth * height * 4)
          gl.readPixels(0, 0, renderWidth, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
          if (gl.getError() !== gl.NO_ERROR) throw new Error('GPU 绘制失败')
          // 保存实际 GPU 画布与独立参考的可视对照，读回仅用于验证。
          const compare = new OffscreenCanvas(renderWidth * 6, height * 12 + 40)
          const context = compare.getContext('2d')
          context.fillStyle = '#222'
          context.fillRect(0, 0, compare.width, compare.height)
          context.fillStyle = '#fff'
          context.font = '14px sans-serif'
          context.fillText('GPU', 4, 15)
          context.fillText('Reference', 4, height * 6 + 35)
          context.imageSmoothingEnabled = false
          context.drawImage(canvas, 0, 20, renderWidth * 6, height * 6)
          const refCanvas = new OffscreenCanvas(width, height)
          const rgba = new Uint8ClampedArray(width * height * 4)
          for (let i = 0; i < width * height; i++)
            rgba.set([reference[i * 3], reference[i * 3 + 1], reference[i * 3 + 2], 255], i * 4)
          refCanvas.getContext('2d').putImageData(new ImageData(rgba, width, height), 0, 0)
          context.drawImage(
            refCanvas,
            fullRange ? 16 : 0,
            0,
            renderWidth,
            height,
            0,
            height * 6 + 40,
            renderWidth * 6,
            height * 6,
          )
          return {
            pixels: Array.from(pixels),
            png: Array.from(new Uint8Array(await (await compare.convertToBlob()).arrayBuffer())),
          }
        } finally {
          renderer.close()
        }
      },
      {
        width,
        height,
        values: Array.from(sampleValues),
        transfer,
        bitDepth,
        fullRange,
        renderWidth,
        reference: Array.from(reference),
      },
    )
    const actual = outputFrame.pixels
    await writeFile(
      `${output}/${transfer}-${bitDepth}-${fullRange ? 'full' : 'limited'}.png`,
      new Uint8Array(outputFrame.png),
    )
    const colors = (fullRange ? patches.slice(1, -1) : patches).map((_, index) => {
      const pixel = 8 * width + (index + (fullRange ? 1 : 0)) * 16 + 8
      const actualPixel = 8 * renderWidth + index * 16 + 8
      const expected = Array.from(reference.subarray(pixel * 3, pixel * 3 + 3))
      const observed = actual.slice(actualPixel * 4, actualPixel * 4 + 3)
      return {
        expected,
        actual: observed,
        error: Math.max(...expected.map((value, channel) => Math.abs(value - observed[channel]))),
      }
    })
    results.push({ ...test, colors, maxError: Math.max(...colors.map((x) => x.error)) })
    console.log(transfer, JSON.stringify(results.at(-1)))
  }
  await writeFile(
    `${output}/result.json`,
    JSON.stringify(
      {
        browser: browser.version(),
        reference: 'PQ: FFmpeg zscale; HLG: Colour 0.4.7 BT.2100-2; 共用 FFmpeg Hable peak=10',
        tolerance: 3,
        results,
      },
      null,
      2,
    ),
  )
  assert(
    results.every((result) => result.maxError <= 3),
    '候选色彩映射与独立参考不一致',
  )
} finally {
  await browser?.close()
  await new Promise((done) => server.close(done))
}
