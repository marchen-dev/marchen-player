/**
 * 只在本地运行的对照测试：用 ffmpeg 解码真实 PGS 样本，与本实现逐像素比较。
 *
 * 编码器和解码器都是自己写的，单元测试可能“自己验证自己”；这里用独立实现兜底。
 * 不进 CI、不提交任何素材：未设置 PGS_SAMPLE 时整组跳过。
 *
 *   PGS_SAMPLE=/path/to/movie.mkv \
 *   PGS_SAMPLE_TIMES=322.3,4200.5 \   # 可选，有字幕的时刻（秒）
 *   PGS_SAMPLE_STREAM=0 \             # 可选，第几条字幕流
 *   pnpm vitest run --config vitest.player-runtime.config.ts pgs-ffmpeg-reference
 */
import type { DisplaySet } from '../subtitles/pgs'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { composeDisplaySet, isIndependent, parseDisplaySet } from '../subtitles/pgs'

const sample = process.env.PGS_SAMPLE
const times = (process.env.PGS_SAMPLE_TIMES ?? '322.3,4200.5').split(',').map(Number)
const stream = process.env.PGS_SAMPLE_STREAM ?? '0'
/** 截取起点距离目标时刻的秒数；ffmpeg 截取后 PTS 从截取起点重新计时 */
const LEAD = 5
/** 只比较完全不透明的像素；两边 BT.709 系数取舍不同，允许 ±1 的舍入误差 */
const TOLERANCE = 1

/** 解析 `.sup`：每段带 13 字节 PG 头，按结束段切分显示集，返回去掉 PG 头后的块数据 */
function readSup(path: string) {
  const data = readFileSync(path)
  const sets: { pts: number; bytes: Uint8Array }[] = []
  let parts: Uint8Array[] = []
  let pts = 0
  for (let i = 0; i < data.length;) {
    if (data[i] !== 0x50 || data[i + 1] !== 0x47) throw new Error('不是有效的 .sup 文件')
    const length = data.readUInt16BE(i + 11)
    if (!parts.length) pts = data.readUInt32BE(i + 2) / 90000
    parts.push(data.subarray(i + 10, i + 13 + length))
    if (data[i + 10] === 0x80) {
      sets.push({ pts, bytes: Buffer.concat(parts) })
      parts = []
    }
    i += 13 + length
  }
  return sets
}

describe.skipIf(!sample)('与 ffmpeg 对照 PGS 解码（本地样本）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pgs-reference-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  for (const time of times) {
    it(`${time} s 处的字幕与 ffmpeg 一致`, () => {
      const sup = join(dir, `${time}.sup`)
      const start = Math.max(0, time - LEAD)
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(start), '-t', String(LEAD * 2), '-i', sample!, '-map', `0:s:${stream}`, '-c', 'copy', '-f', 'sup', sup])
      const sets = readSup(sup)
      const relative = time - start
      const index = sets.findLastIndex((set) => set.pts <= relative)
      expect(index, '目标时刻之前没有显示集').toBeGreaterThanOrEqual(0)
      const parsed: DisplaySet[] = sets.slice(0, index + 1).map((set) => parseDisplaySet(set.bytes))
      let from = index
      while (from > 0 && !isIndependent(parsed[from])) from--
      const frame = composeDisplaySet(parsed.slice(from), { hdr: false })
      expect(frame.rects.length, '目标时刻没有显示字幕，请换一个时刻').toBeGreaterThan(0)

      // ffmpeg：把字幕叠加到黑色画布上，取同一时刻的一帧。
      // -copyts 必不可少：否则 ffmpeg 会把 .sup 第一个包的时间归零，叠加时取到另一句字幕。
      // 叠加必须在 RGB 中进行：默认在 YUV 中叠加再转回 RGB，会多一次舍入（最大差可到 3）。
      const { width, height } = frame
      const raw = execFileSync('ffmpeg', ['-v', 'error', '-copyts', '-f', 'lavfi', '-i', `color=c=black:s=${width}x${height}:r=25:d=${LEAD * 2}`, '-i', sup, '-filter_complex', '[0:v]format=rgb24[bg];[bg][1:s]overlay=format=rgb', '-ss', String(relative), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: width * height * 3 + 1024 })
      expect(raw.length).toBe(width * height * 3)

      let compared = 0
      let worst = 0
      for (const rect of frame.rects) {
        for (let row = 0; row < rect.height; row++) {
          for (let column = 0; column < rect.width; column++) {
            const at = (row * rect.width + column) * 4
            if (rect.rgba[at + 3] !== 255) continue
            const x = rect.x + column
            const y = rect.y + row
            if (x >= width || y >= height) continue
            const ref = (y * width + x) * 3
            for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(rect.rgba[at + c] - raw[ref + c]))
            compared++
          }
        }
      }
      console.warn(`[pgs-reference] ${time}s：比较 ${compared} 个不透明像素，最大差 ${worst}`)
      expect(compared).toBeGreaterThan(1000)
      expect(worst).toBeLessThanOrEqual(TOLERANCE)
    })
  }
})
