/**
 * 测试专用的最小 PGS 编码器：生成 MKV 块里的显示集字节（不带 `.sup` 的 PG 头）。
 * 只覆盖测试需要的字段，便于构造分片、依赖、裁剪和损坏数据；不进产品代码。
 */

export const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}
const u16 = (n: number) => [n >> 8, n & 255]

export const segment = (type: number, payload: Uint8Array | number[]) => {
  const body = payload instanceof Uint8Array ? payload : new Uint8Array(payload)
  return concat(new Uint8Array([type, ...u16(body.length)]), body)
}

export interface PlacementInput {
  objectId: number
  x: number
  y: number
  windowId?: number
  forced?: boolean
  crop?: { x: number; y: number; width: number; height: number }
}

export const pcs = (options: {
  width?: number
  height?: number
  state?: 'normal' | 'acquisition_point' | 'epoch_start'
  paletteUpdate?: boolean
  paletteId?: number
  objects?: PlacementInput[]
}) => {
  const state = { normal: 0, acquisition_point: 0x40, epoch_start: 0x80 }[options.state ?? 'epoch_start']
  const bytes = [
    ...u16(options.width ?? 1920),
    ...u16(options.height ?? 1080),
    0x10,
    ...u16(0),
    state,
    options.paletteUpdate ? 0x80 : 0,
    options.paletteId ?? 0,
    options.objects?.length ?? 0,
  ]
  for (const object of options.objects ?? []) {
    bytes.push(...u16(object.objectId), object.windowId ?? 0)
    bytes.push((object.crop ? 0x80 : 0) | (object.forced ? 0x40 : 0))
    bytes.push(...u16(object.x), ...u16(object.y))
    if (object.crop)
      bytes.push(...u16(object.crop.x), ...u16(object.crop.y), ...u16(object.crop.width), ...u16(object.crop.height))
  }
  return segment(0x16, bytes)
}

export const wds = (windows: { id: number; x: number; y: number; width: number; height: number }[]) =>
  segment(0x17, [
    windows.length,
    ...windows.flatMap((w) => [w.id, ...u16(w.x), ...u16(w.y), ...u16(w.width), ...u16(w.height)]),
  ])

/** 调色板项按 PGS 顺序：索引、Y、Cr、Cb、透明度 */
export const pds = (id: number, entries: [index: number, y: number, cr: number, cb: number, alpha: number][]) =>
  segment(0x14, [id, 0, ...entries.flat()])

/** 按 PGS 规则编码一行行的调色板索引；四种行程形式都会用到 */
export function encodeRle(indices: ArrayLike<number>, width: number): Uint8Array {
  const out: number[] = []
  for (let row = 0; row * width < indices.length; row++) {
    let column = 0
    while (column < width) {
      const color = indices[row * width + column]
      let length = 1
      while (column + length < width && indices[row * width + column + length] === color && length < 16383)
        length++
      if (color !== 0 && length < 3) {
        for (let k = 0; k < length; k++) out.push(color)
      } else if (color === 0) {
        out.push(0, ...(length < 64 ? [length] : [0x40 | (length >> 8), length & 255]))
      } else {
        out.push(0, ...(length < 64 ? [0x80 | length] : [0xC0 | (length >> 8), length & 255]), color)
      }
      column += length
    }
    out.push(0, 0)
  }
  return new Uint8Array(out)
}

/** 对象定义；fragments > 1 时拆成首片、中间片、末片 */
export const ods = (
  id: number,
  width: number,
  height: number,
  rle: Uint8Array,
  options: { fragments?: number; declaredLength?: number } = {},
) => {
  const fragments = options.fragments ?? 1
  const size = Math.ceil(rle.length / fragments)
  const parts: Uint8Array[] = []
  for (let i = 0; i < fragments; i++) {
    const first = i === 0
    const last = i === fragments - 1
    const chunk = rle.subarray(i * size, last ? rle.length : (i + 1) * size)
    const head = [...u16(id), 0, (first ? 0x80 : 0) | (last ? 0x40 : 0)]
    if (first) {
      const declared = options.declaredLength ?? rle.length + 4
      head.push(declared >> 16, (declared >> 8) & 255, declared & 255, ...u16(width), ...u16(height))
    }
    parts.push(segment(0x15, concat(new Uint8Array(head), chunk)))
  }
  return concat(...parts)
}

export const end = () => segment(0x80, [])

/** 常用组合：一个对象、一个调色板、一个窗口的完整显示集 */
export function simpleDisplaySet(options: {
  state?: 'normal' | 'acquisition_point' | 'epoch_start'
  objectId?: number
  x?: number
  y?: number
  width: number
  height: number
  indices: ArrayLike<number>
  palette: [number, number, number, number, number][]
  fragments?: number
}) {
  const objectId = options.objectId ?? 0
  return concat(
    pcs({
      state: options.state,
      objects: [{ objectId, x: options.x ?? 100, y: options.y ?? 900 }],
    }),
    wds([{ id: 0, x: 0, y: 0, width: 1920, height: 1080 }]),
    pds(0, options.palette),
    ods(objectId, options.width, options.height, encodeRle(options.indices, options.width), {
      fragments: options.fragments,
    }),
    end(),
  )
}

/** 清屏显示集：合成对象数为 0 */
export const clearDisplaySet = () => concat(pcs({ state: 'normal' }), wds([]), end())
