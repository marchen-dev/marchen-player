import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

// 只生成可公开的数值测试图；FFmpeg 仅用于测试夹具，不进入播放器运行链路。
const dir = new URL('../../../test-results/hdr/', import.meta.url)
await mkdir(dir, { recursive: true })
const luminance = process.argv.includes('--luminance')
const colors = process.argv.includes('--colors')
const name = colors ? 'colors' : luminance ? 'luminance' : 'precision'
const pq = (n) => {
  const p = (n / 10000) ** (2610 / 16384)
  return ((3424 / 4096 + (2413 / 128) * p) / (1 + (2392 / 128) * p)) ** (2523 / 32)
}
const codes = luminance
  ? [100, 203, 400, 1000].map((n) => Math.round(64 + 876 * pq(n)))
  : [512, 513, 514, 515]
const width = 256
const height = 64
const frame = Buffer.alloc(width * height * 3)
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++)
    frame.writeUInt16LE(codes[Math.floor(x / 64)], (y * width + x) * 2)
}
for (let offset = width * height * 2; offset < frame.length; offset += 2)
  frame.writeUInt16LE(512, offset)
if (colors)
  for (let plane = 0; plane < 2; plane++)
    for (let y = 0; y < height / 2; y++)
      for (let x = 0; x < width / 2; x++) {
        const values = plane ? [512, 460, 620, 430] : [512, 600, 420, 560]
        frame.writeUInt16LE(
          values[Math.floor(x / 32)],
          width * height * 2 + (plane * width * height) / 2 + ((y * width) / 2 + x) * 2,
        )
      }
const raw = new URL(`${name}.yuv`, dir)
const video = new URL(`${name}.mp4`, dir)
const decoded = new URL('decoded.yuv', dir)
await writeFile(raw, Buffer.concat(Array.from({ length: 32 }, () => frame)))
execFileSync('ffmpeg', [
  '-v',
  'error',
  '-f',
  'rawvideo',
  '-pixel_format',
  'yuv420p10le',
  '-video_size',
  '256x64',
  '-framerate',
  '24',
  '-color_range',
  'tv',
  '-colorspace',
  'bt2020nc',
  '-color_trc',
  'smpte2084',
  '-color_primaries',
  'bt2020',
  '-i',
  raw.pathname,
  '-c:v',
  'libx265',
  '-x265-params',
  'lossless=1:log-level=error:pools=1:colorprim=9:transfer=16:colormatrix=9:range=limited',
  '-color_range',
  'tv',
  '-colorspace',
  'bt2020nc',
  '-color_trc',
  'smpte2084',
  '-color_primaries',
  'bt2020',
  '-tag:v',
  'hvc1',
  '-y',
  video.pathname,
])
execFileSync('ffmpeg', [
  '-v',
  'error',
  '-i',
  video.pathname,
  '-frames:v',
  '1',
  '-pix_fmt',
  'yuv420p10le',
  '-f',
  'rawvideo',
  '-y',
  decoded.pathname,
])
assert((await readFile(decoded)).equals(frame), 'HEVC 夹具解码与原始平面不一致')
console.log(`HEVC PQ 无损夹具已生成并逐字节验证：test-results/hdr/${name}.mp4`)
