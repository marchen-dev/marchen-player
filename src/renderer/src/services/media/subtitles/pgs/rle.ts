import { PgsError } from './errors'

/** 单个对象的像素上限（防御性）：远大于真实字幕，但能挡住损坏数据里的巨大宽高 */
export const MAX_OBJECT_PIXELS = 1920 * 1080 * 4

/**
 * 按 PGS 行程编码还原调色板索引。
 *
 * 编码规则（每行以 `00 00` 结束）：
 * - `CC`（非 0）：1 个颜色为 CC 的像素
 * - `00 0L`：L 个颜色 0 的像素（L 为 6 位）
 * - `00 4L LL`：L 个颜色 0 的像素（L 为 14 位）
 * - `00 8L CC`：L 个颜色 CC 的像素（L 为 6 位）
 * - `00 CL LL CC`：L 个颜色 CC 的像素（L 为 14 位）
 *
 * 行溢出、数据越界或行数不足都判为损坏。某行在行结束前像素不足时补透明（颜色 0）：
 * 部分编码器会省略行尾的透明像素，补齐后总像素数仍等于宽 × 高。
 */
export function decodeRle(rle: Uint8Array, width: number, height: number): Uint8Array {
  if (!width || !height) throw new PgsError('rle_invalid', '对象尺寸为 0')
  if (width * height > MAX_OBJECT_PIXELS) throw new PgsError('object_too_large', '对象尺寸超过上限')
  const out = new Uint8Array(width * height)
  let row = 0
  let column = 0
  let i = 0
  const byte = () => {
    if (i >= rle.length) throw new PgsError('rle_invalid', 'RLE 数据被截断')
    return rle[i++]
  }
  while (i < rle.length) {
    if (row >= height) throw new PgsError('rle_invalid', 'RLE 行数超过对象高度')
    const first = byte()
    let length = 1
    let color = first
    if (first === 0) {
      const flags = byte()
      if (flags === 0) {
        // 行结束：剩余位置保持 0（透明）
        row++
        column = 0
        continue
      }
      length = flags & 0x3F
      if (flags & 0x40) length = (length << 8) | byte()
      color = flags & 0x80 ? byte() : 0
    }
    if (column + length > width) throw new PgsError('rle_invalid', 'RLE 行像素超过对象宽度')
    out.fill(color, row * width + column, row * width + column + length)
    column += length
  }
  // 最后一行可能省略行结束标记
  if (column > 0) row++
  if (row !== height) throw new PgsError('rle_invalid', 'RLE 行数少于对象高度')
  return out
}
