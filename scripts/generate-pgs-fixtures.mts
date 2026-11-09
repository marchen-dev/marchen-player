/**
 * 生成 PGS 的 MKV 测试素材（自造内容，不含任何影片字幕）。需要本机安装 ffmpeg 与 mkvmerge。
 *
 *   node --experimental-strip-types scripts/generate-pgs-fixtures.mts
 *
 * 产出（src/renderer/src/services/media/tests/fixtures/pgs/）：
 * - with-cues.mkv：mkvmerge 默认封装，字幕每个块都有 Cues；视频标为 PQ
 * - no-subtitle-cues.mkv：关闭字幕轨 Cues，只剩视频关键帧 Cues
 * - no-cues.mkv：所有轨道都不写 Cues
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  clearDisplaySet,
  concat,
  encodeRle,
  end,
  ods,
  pcs,
  pds,
  simpleDisplaySet,
  wds,
} from '../src/renderer/src/services/media/tests/pgs-encoder.ts'

const here = join(dirname(fileURLToPath(import.meta.url)), '../src/renderer/src/services/media/tests/fixtures/pgs')
const palette: [number, number, number, number, number][] = [
  [1, 235, 128, 128, 255],
  [2, 16, 128, 128, 255],
]
const bar = (width: number, height: number, color: number) =>
  Array.from<number>({ length: width * height }).fill(color)

/** 时间（秒）→ 显示集；与 pgs-matroska.test.ts 的断言一一对应 */
export const SCRIPT: [number, Uint8Array][] = [
  // 1 s：Epoch Start，单对象 40×10 白色
  [1, simpleDisplaySet({ x: 10, y: 20, width: 40, height: 10, indices: bar(40, 10, 1), palette })],
  // 2 s：清屏
  [2, clearDisplaySet()],
  // 3 s：Acquisition Point，两个对象（白 / 黑）
  [
    3,
    concat(
      pcs({
        state: 'acquisition_point',
        objects: [
          { objectId: 0, x: 100, y: 900 },
          { objectId: 1, x: 100, y: 950 },
        ],
      }),
      wds([{ id: 0, x: 0, y: 0, width: 1920, height: 1080 }]),
      pds(0, palette),
      ods(0, 30, 8, encodeRle(bar(30, 8, 1), 30)),
      ods(1, 20, 8, encodeRle(bar(20, 8, 2), 20)),
      end(),
    ),
  ],
  // 4 s：Normal，只移动对象 0，依赖 3 s 的定义
  [4, concat(pcs({ state: 'normal', objects: [{ objectId: 0, x: 500, y: 800 }] }), end())],
  // 5 s：清屏
  [5, clearDisplaySet()],
  // 6 s：Epoch Start，对象拆成 3 个分片
  [6, simpleDisplaySet({ x: 0, y: 0, width: 64, height: 16, indices: bar(64, 16, 2), palette, fragments: 3 })],
  // 7 s：清屏
  [7, clearDisplaySet()],
]

/** 把显示集（段序列）写成 .sup：每段前加 13 字节 PG 头（魔数、PTS、DTS） */
function toSup(script: [number, Uint8Array][]) {
  const out: Uint8Array[] = []
  for (const [time, bytes] of script) {
    const pts = Math.round(time * 90000)
    for (let i = 0; i < bytes.length;) {
      const length = (bytes[i + 1] << 8) | bytes[i + 2]
      const head = new Uint8Array(10)
      head.set([0x50, 0x47, pts >>> 24, (pts >> 16) & 255, (pts >> 8) & 255, pts & 255])
      out.push(head, bytes.subarray(i, i + 3 + length))
      i += 3 + length
    }
  }
  return concat(...out)
}

const work = mkdtempSync(join(tmpdir(), 'pgs-fixture-'))
try {
  const sup = join(work, 'sub.sup')
  const video = join(work, 'video.mkv')
  writeFileSync(sup, toSup(SCRIPT))
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:r=10:d=10', '-c:v', 'libx264', '-g', '10', '-pix_fmt', 'yuv420p', video])
  const run = (name: string, args: string[]) =>
    execFileSync('mkvmerge', ['-q', '--no-date', '-o', join(here, name), ...args])
  // 视频输入在前（轨道 1），字幕在后（轨道 2）
  run('with-cues.mkv', ['--colour-transfer-characteristics', '0:16', video, '--track-name', '0:自造 PGS', '--language', '0:zh', sup])
  run('no-subtitle-cues.mkv', [video, '--cues', '0:none', sup])
  run('no-cues.mkv', ['--cues', '0:none', video, '--cues', '0:none', sup])
} finally {
  rmSync(work, { recursive: true, force: true })
}
