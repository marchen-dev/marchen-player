import { describe, expect, it } from 'vitest'
import {
  composeDisplaySet,
  decodeRle,
  paletteToRgba,
  parseDisplaySet,
  PgsError,
} from '../subtitles/pgs'
import {
  clearDisplaySet,
  concat,
  encodeRle,
  end,
  ods,
  pcs,
  pds,
  segment,
  simpleDisplaySet,
  wds,
} from './pgs-encoder'

/** 白色（BT.709 limited 下 Y=235）不透明、半透明黑色描边 */
const palette: [number, number, number, number, number][] = [
  [1, 235, 128, 128, 255],
  [2, 16, 128, 128, 128],
]
const code = (fn: () => unknown) => {
  try {
    fn()
  } catch (error) {
    if (error instanceof PgsError) return error.code
    throw error
  }
  return 'ok'
}

describe('显示集解析', () => {
  it('单对象显示集产出位置和画布尺寸正确的位图', () => {
    const indices = [1, 1, 2, 0, 1, 2]
    const set = parseDisplaySet(simpleDisplaySet({ x: 300, y: 950, width: 3, height: 2, indices, palette }))
    expect(set.composition).toMatchObject({ width: 1920, height: 1080, state: 'epoch_start' })
    const frame = composeDisplaySet([set], { hdr: false })
    expect(frame).toMatchObject({ width: 1920, height: 1080 })
    expect(frame.rects).toHaveLength(1)
    expect(frame.rects[0]).toMatchObject({ x: 300, y: 950, width: 3, height: 2 })
    // 第一个像素为白色不透明，第四个为未使用的索引 0，完全透明
    expect([...frame.rects[0].rgba.subarray(0, 4)]).toEqual([255, 255, 255, 255])
    expect([...frame.rects[0].rgba.subarray(12, 16)]).toEqual([0, 0, 0, 0])
  })

  it('分片对象拼接后与未分片结果一致', () => {
    const indices = Array.from({ length: 40 * 6 }, (_, i) => (i % 7 === 0 ? 2 : 1))
    const whole = composeDisplaySet(
      [parseDisplaySet(simpleDisplaySet({ width: 40, height: 6, indices, palette }))],
      { hdr: false },
    )
    const split = composeDisplaySet(
      [parseDisplaySet(simpleDisplaySet({ width: 40, height: 6, indices, palette, fragments: 3 }))],
      { hdr: false },
    )
    expect(split.rects[0].rgba).toEqual(whole.rects[0].rgba)
  })

  it('合成对象数为 0 的显示集表示清屏', () => {
    const first = parseDisplaySet(simpleDisplaySet({ width: 1, height: 1, indices: [1], palette }))
    const frame = composeDisplaySet([first, parseDisplaySet(clearDisplaySet())], { hdr: false })
    expect(frame.rects).toEqual([])
  })

  it('段长度越界判为损坏', () => {
    const bytes = simpleDisplaySet({ width: 1, height: 1, indices: [1], palette })
    // 把第一个段的长度改大，使其超出块数据
    const broken = bytes.slice()
    broken[1] = 0xFF
    expect(code(() => parseDisplaySet(broken))).toBe('segment_invalid')
  })

  it('缺少合成段或结束段、分片不完整都返回稳定原因码', () => {
    expect(code(() => parseDisplaySet(concat(wds([]), end())))).toBe('composition_missing')
    expect(code(() => parseDisplaySet(concat(pcs({}), wds([]))))).toBe('composition_missing')
    const rle = encodeRle([1, 1, 1, 1], 4)
    // 声明长度比实际数据多 1 字节
    const mismatch = concat(pcs({}), ods(0, 4, 1, rle, { declaredLength: rle.length + 5 }), end())
    expect(code(() => parseDisplaySet(mismatch))).toBe('object_incomplete')
    // 只有末片
    const tail = concat(pcs({}), segment(0x15, [0, 0, 0, 0x40, 1]), end())
    expect(code(() => parseDisplaySet(tail))).toBe('object_incomplete')
  })

  it('解析裁剪和强制字幕标记', () => {
    const indices = [1, 1, 2, 2, 1, 1, 2, 2]
    const bytes = concat(
      pcs({ objects: [{ objectId: 0, x: 10, y: 20, forced: true, crop: { x: 2, y: 0, width: 2, height: 2 } }] }),
      pds(0, palette),
      ods(0, 4, 2, encodeRle(indices, 4)),
      end(),
    )
    const set = parseDisplaySet(bytes)
    expect(set.composition.objects[0]).toMatchObject({ forced: true, crop: { x: 2, width: 2 } })
    const frame = composeDisplaySet([set], { hdr: false })
    expect(frame.rects[0]).toMatchObject({ x: 10, y: 20, width: 2, height: 2 })
    // 裁剪后只剩索引 2（半透明黑）
    expect(frame.rects[0].rgba[3]).toBe(128)
  })
})

describe('epoch 依赖', () => {
  it('普通（Normal）显示集沿用前一个 Acquisition Point 的对象和调色板', () => {
    const base = parseDisplaySet(
      simpleDisplaySet({ state: 'acquisition_point', x: 100, y: 900, width: 2, height: 1, indices: [1, 1], palette }),
    )
    const moved = parseDisplaySet(concat(pcs({ state: 'normal', objects: [{ objectId: 0, x: 500, y: 800 }] }), end()))
    const frame = composeDisplaySet([base, moved], { hdr: false })
    expect(frame.rects[0]).toMatchObject({ x: 500, y: 800, width: 2, height: 1 })
    expect(frame.rects[0].rgba[0]).toBe(255)
  })

  it('同一 epoch 内后出现的调色板覆盖先出现的', () => {
    const base = parseDisplaySet(simpleDisplaySet({ width: 1, height: 1, indices: [1], palette }))
    // 只更新调色板：索引 1 改为黑色
    const update = parseDisplaySet(
      concat(
        pcs({ state: 'normal', paletteUpdate: true, objects: [{ objectId: 0, x: 100, y: 900 }] }),
        pds(0, [[1, 16, 128, 128, 255]]),
        end(),
      ),
    )
    const frame = composeDisplaySet([base, update], { hdr: false })
    expect([...frame.rects[0].rgba]).toEqual([0, 0, 0, 255])
  })

  it('遇到 Epoch Start 时清空此前的定义', () => {
    const base = parseDisplaySet(simpleDisplaySet({ width: 1, height: 1, indices: [1], palette }))
    // 新 epoch 只给调色板，引用旧 epoch 的对象 0
    const restart = parseDisplaySet(
      concat(pcs({ state: 'epoch_start', objects: [{ objectId: 0, x: 0, y: 0 }] }), pds(0, palette), end()),
    )
    expect(code(() => composeDisplaySet([base, restart], { hdr: false }))).toBe('dependency_missing')
  })

  it('引用从未定义的对象判为不可显示', () => {
    const base = parseDisplaySet(simpleDisplaySet({ state: 'acquisition_point', width: 1, height: 1, indices: [1], palette }))
    const missing = parseDisplaySet(concat(pcs({ state: 'normal', objects: [{ objectId: 7, x: 0, y: 0 }] }), end()))
    expect(code(() => composeDisplaySet([base, missing], { hdr: false }))).toBe('dependency_missing')
  })

  it('链不从可独立显示的显示集开始时拒绝合成', () => {
    const normal = parseDisplaySet(concat(pcs({ state: 'normal' }), end()))
    expect(code(() => composeDisplaySet([normal], { hdr: false }))).toBe('dependency_missing')
  })
})

describe('行程编码（RLE）解码', () => {
  it('四种行程形式都能还原', () => {
    // 70×2：单像素、短行程颜色 0、长行程有色（66 个，需要 14 位长度）、整行颜色 0
    const width = 70
    const indices: number[] = [
      ...[5, 0, 0, 0],
      ...Array.from<number>({ length: 66 }).fill(3),
      ...Array.from<number>({ length: 70 }).fill(0),
    ]
    expect([...decodeRle(encodeRle(indices, width), width, 2)]).toEqual(indices)
    // 编码器确实用到了 14 位长度形式
    expect([...encodeRle(indices, width)]).toContain(0xC0)
  })

  it('最后一行省略行结束标记仍然有效，行尾不足补透明', () => {
    // 宽 4：第一行只编码 2 个像素就结束，第二行 4 个像素且没有结束标记
    const rle = new Uint8Array([1, 1, 0, 0, 2, 2, 2, 2])
    expect([...decodeRle(rle, 4, 2)]).toEqual([1, 1, 0, 0, 2, 2, 2, 2])
  })

  it('行数不足、行溢出、数据截断判为损坏', () => {
    expect(code(() => decodeRle(encodeRle([1, 1, 1, 1], 4), 4, 2))).toBe('rle_invalid')
    expect(code(() => decodeRle(new Uint8Array([1, 1, 1, 1, 1, 0, 0]), 4, 1))).toBe('rle_invalid')
    expect(code(() => decodeRle(new Uint8Array([0, 0x81]), 4, 1))).toBe('rle_invalid')
  })

  it('超出尺寸上限直接拒绝', () => {
    expect(code(() => decodeRle(new Uint8Array(), 10000, 10000))).toBe('object_too_large')
  })
})

describe('调色板换算', () => {
  const definition = (entries: [number, number, number, number, number][]) => ({
    id: 0,
    version: 0,
    entries: new Map(entries.map(([index, y, cr, cb, alpha]) => [index, { y, cr, cb, alpha }])),
  })

  it('普通视频按 BT.709 换算，白色为 255', () => {
    const table = paletteToRgba(definition([[1, 235, 128, 128, 255]]), false)
    expect([...table.subarray(4, 8)]).toEqual([255, 255, 255, 255])
  })

  it('高动态范围视频的字幕主体亮度与 mpv 基准一致（±3）', () => {
    // UHD 原盘实测：Y=154、Cr=127、Cb=128，mpv SDR 输出约 R175 / G180 / B180
    const table = paletteToRgba(definition([[1, 154, 127, 128, 255]]), true)
    const [r, g, b] = table.subarray(4, 7)
    expect(Math.abs(r - 175)).toBeLessThanOrEqual(3)
    expect(Math.abs(g - 180.4)).toBeLessThanOrEqual(3)
    expect(Math.abs(b - 180.4)).toBeLessThanOrEqual(3)
    // 未提亮时约 161，明显更暗
    const sdr = paletteToRgba(definition([[1, 154, 127, 128, 255]]), false)
    expect(sdr[5]).toBeLessThan(165)
  })

  it('提亮后裁剪到白色且不改变透明度，未定义索引完全透明', () => {
    const table = paletteToRgba(definition([[1, 235, 128, 128, 128]]), true)
    expect([...table.subarray(4, 8)]).toEqual([255, 255, 255, 128])
    expect([...table.subarray(8, 12)]).toEqual([0, 0, 0, 0])
  })
})
