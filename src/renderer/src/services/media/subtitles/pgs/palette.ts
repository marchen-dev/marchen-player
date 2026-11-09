import type { PaletteDefinition } from './segments'

/**
 * HDR 视频（PQ / HLG）字幕的固定增益。
 *
 * 由门槛实验标定（evidence/gate/hdr-palette.md）：UHD 原盘字幕主体 Y=154，按 BT.709 换算约 161，
 * mpv 在 SDR 输出下与视频一起色调映射后约 178；乘以 1.11 后与 mpv 一致。
 * 不做 PQ 线性化：字幕画布既不能超过 SDR 白，也不能参与视频的色调映射。
 */
export const HDR_SUBTITLE_GAIN = 1.11

const clamp = (value: number) => (value <= 0 ? 0 : value >= 255 ? 255 : Math.round(value))

/**
 * 把调色板换算为 256 项 RGBA 查找表（非预乘），每项 4 字节。
 * 所有视频都按 BT.709 limited range 换算；HDR 视频再统一提亮。透明度原样保留，
 * 未定义的索引保持全 0，即完全透明。
 */
export function paletteToRgba(palette: PaletteDefinition, hdr: boolean): Uint8ClampedArray {
  const table = new Uint8ClampedArray(256 * 4)
  const gain = hdr ? HDR_SUBTITLE_GAIN : 1
  for (const [index, { y, cr, cb, alpha }] of palette.entries) {
    const luma = 1.164 * (y - 16)
    const r = luma + 1.793 * (cr - 128)
    const g = luma - 0.213 * (cb - 128) - 0.533 * (cr - 128)
    const b = luma + 2.112 * (cb - 128)
    const at = index * 4
    table[at] = clamp(r * gain)
    table[at + 1] = clamp(g * gain)
    table[at + 2] = clamp(b * gain)
    table[at + 3] = alpha
  }
  return table
}
