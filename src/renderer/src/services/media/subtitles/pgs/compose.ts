import type { DisplaySet, ObjectDefinition, PaletteDefinition } from './segments'
import { PgsError } from './errors'
import { paletteToRgba } from './palette'
import { decodeRle } from './rle'

/** 一块待绘制的字幕位图；坐标与尺寸都属于 PGS 画布 */
export interface PgsRect {
  x: number
  y: number
  width: number
  height: number
  /** 非预乘 RGBA，长度为 width × height × 4，可直接构造 ImageData */
  rgba: Uint8ClampedArray
}

/** 某个显示集合成后的画面；rects 为空表示从此刻起不显示字幕 */
export interface PgsFrame {
  width: number
  height: number
  rects: PgsRect[]
}

/** 显示集是否可以不依赖之前的定义独立解码 */
export const isIndependent = (set: DisplaySet) => set.composition.state !== 'normal'

/**
 * 合成 `chain` 中最后一个显示集的画面。
 *
 * `chain` 必须从可独立显示的显示集（Epoch Start 或 Acquisition Point）开始、按时间排序；
 * Normal 显示集会沿用此前定义的调色板和对象，同 ID 后出现的定义覆盖先出现的。
 * Epoch Start 会清空此前的所有定义。目标引用的对象或调色板找不到时抛出 dependency_missing，
 * 绝不用错误的调色板或空对象替代。
 */
export function composeDisplaySet(chain: readonly DisplaySet[], options: { hdr: boolean }): PgsFrame {
  if (!chain.length) throw new PgsError('dependency_missing', '没有可合成的显示集')
  if (!isIndependent(chain[0])) throw new PgsError('dependency_missing', '显示集链不是从 epoch 起点开始')
  const palettes = new Map<number, PaletteDefinition>()
  const objects = new Map<number, ObjectDefinition>()
  for (const set of chain) {
    if (set.composition.state === 'epoch_start') {
      palettes.clear()
      objects.clear()
    }
    for (const palette of set.palettes) palettes.set(palette.id, palette)
    for (const object of set.objects) objects.set(object.id, object)
  }

  const target = chain[chain.length - 1].composition
  const frame: PgsFrame = { width: target.width, height: target.height, rects: [] }
  if (!target.objects.length) return frame

  const palette = palettes.get(target.paletteId)
  if (!palette) throw new PgsError('dependency_missing', `找不到调色板 ${target.paletteId}`)
  const table = paletteToRgba(palette, options.hdr)

  for (const placement of target.objects) {
    const object = objects.get(placement.objectId)
    if (!object) throw new PgsError('dependency_missing', `找不到对象 ${placement.objectId}`)
    const indices = decodeRle(object.rle, object.width, object.height)
    // 裁剪区域按对象边界收紧；没有裁剪时显示整个对象
    const crop = placement.crop ?? { x: 0, y: 0, width: object.width, height: object.height }
    const left = Math.min(crop.x, object.width)
    const top = Math.min(crop.y, object.height)
    const width = Math.min(crop.width, object.width - left)
    const height = Math.min(crop.height, object.height - top)
    if (width <= 0 || height <= 0) continue
    const rgba = new Uint8ClampedArray(width * height * 4)
    for (let row = 0; row < height; row++) {
      const source = (top + row) * object.width + left
      let at = row * width * 4
      for (let column = 0; column < width; column++) {
        const entry = indices[source + column] * 4
        rgba[at++] = table[entry]
        rgba[at++] = table[entry + 1]
        rgba[at++] = table[entry + 2]
        rgba[at++] = table[entry + 3]
      }
    }
    frame.rects.push({ x: placement.x, y: placement.y, width, height, rgba })
  }
  return frame
}
