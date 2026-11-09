import { PgsError } from './errors'

/**
 * PGS（Presentation Graphic Stream）显示集解析。
 *
 * MKV 的 `S_HDMV/PGS` 块（按轨道内容编码解压后）恰好是一个完整的显示集，
 * 由若干段组成：`类型(1) + 长度(2) + 载荷`。与 `.sup` 文件不同，块里没有 `PG` 魔数和 PTS 头，
 * 时间来自容器的块时间戳。
 */

export const SegmentType = {
  palette: 0x14,
  object: 0x15,
  composition: 0x16,
  window: 0x17,
  end: 0x80,
} as const

/** 合成状态：Normal 可以沿用同一 epoch 中之前的定义；其他两种可以独立显示 */
export type CompositionState = 'normal' | 'acquisition_point' | 'epoch_start'

export interface CompositionObject {
  objectId: number
  windowId: number
  /** 强制字幕标记；本次按原样显示全部对象，只保留信息 */
  forced: boolean
  x: number
  y: number
  /** 只显示对象的这一部分；坐标相对对象左上角 */
  crop?: { x: number; y: number; width: number; height: number }
}

export interface Composition {
  /** PGS 画布尺寸，例如 1920×1080；与视频分辨率无关 */
  width: number
  height: number
  state: CompositionState
  /** 只更新调色板（淡入淡出常用），对象沿用之前的定义 */
  paletteUpdate: boolean
  paletteId: number
  objects: CompositionObject[]
}

export interface WindowDefinition {
  id: number
  x: number
  y: number
  width: number
  height: number
}

/** 调色板项按 PGS 原始顺序保存 Y、Cr、Cb、透明度 */
export interface PaletteEntry {
  y: number
  cr: number
  cb: number
  alpha: number
}

export interface PaletteDefinition {
  id: number
  version: number
  entries: Map<number, PaletteEntry>
}

export interface ObjectDefinition {
  id: number
  version: number
  width: number
  height: number
  /** 分片拼接后的完整 RLE 数据 */
  rle: Uint8Array
}

export interface DisplaySet {
  composition: Composition
  windows: WindowDefinition[]
  palettes: PaletteDefinition[]
  objects: ObjectDefinition[]
}

const stateOf = (value: number): CompositionState =>
  value & 0x80 ? 'epoch_start' : value & 0x40 ? 'acquisition_point' : 'normal'

/** 只在本模块内使用的边界检查读取器，越界统一报 segment_invalid */
class Cursor {
  offset = 0
  constructor(private readonly bytes: Uint8Array, private readonly label: string) {}

  get remaining() {
    return this.bytes.length - this.offset
  }

  need(count: number) {
    if (this.offset + count > this.bytes.length)
      throw new PgsError('segment_invalid', `${this.label}字段不完整`)
  }

  u8() {
    this.need(1)
    return this.bytes[this.offset++]
  }

  u16() {
    this.need(2)
    const value = (this.bytes[this.offset] << 8) | this.bytes[this.offset + 1]
    this.offset += 2
    return value
  }

  u24() {
    this.need(3)
    const value =
      (this.bytes[this.offset] << 16) | (this.bytes[this.offset + 1] << 8) | this.bytes[this.offset + 2]
    this.offset += 3
    return value
  }

  rest() {
    const value = this.bytes.subarray(this.offset)
    this.offset = this.bytes.length
    return value
  }
}

function parseComposition(payload: Uint8Array): Composition {
  const cursor = new Cursor(payload, '合成段')
  const width = cursor.u16()
  const height = cursor.u16()
  cursor.u8() // 帧率，PGS 规范固定为 0x10，不使用
  cursor.u16() // 合成编号，按块时间排序即可，不使用
  const state = stateOf(cursor.u8())
  const paletteUpdate = (cursor.u8() & 0x80) !== 0
  const paletteId = cursor.u8()
  const count = cursor.u8()
  const objects: CompositionObject[] = []
  for (let i = 0; i < count; i++) {
    const objectId = cursor.u16()
    const windowId = cursor.u8()
    const flags = cursor.u8()
    const object: CompositionObject = {
      objectId,
      windowId,
      forced: (flags & 0x40) !== 0,
      x: cursor.u16(),
      y: cursor.u16(),
    }
    if (flags & 0x80)
      object.crop = { x: cursor.u16(), y: cursor.u16(), width: cursor.u16(), height: cursor.u16() }
    objects.push(object)
  }
  if (!width || !height) throw new PgsError('segment_invalid', '合成段画布尺寸无效')
  return { width, height, state, paletteUpdate, paletteId, objects }
}

function parseWindows(payload: Uint8Array): WindowDefinition[] {
  const cursor = new Cursor(payload, '窗口段')
  const count = cursor.u8()
  const windows: WindowDefinition[] = []
  for (let i = 0; i < count; i++)
    windows.push({ id: cursor.u8(), x: cursor.u16(), y: cursor.u16(), width: cursor.u16(), height: cursor.u16() })
  return windows
}

function parsePalette(payload: Uint8Array): PaletteDefinition {
  const cursor = new Cursor(payload, '调色板段')
  const id = cursor.u8()
  const version = cursor.u8()
  if (cursor.remaining % 5) throw new PgsError('segment_invalid', '调色板项长度无效')
  const entries = new Map<number, PaletteEntry>()
  while (cursor.remaining) {
    const index = cursor.u8()
    entries.set(index, { y: cursor.u8(), cr: cursor.u8(), cb: cursor.u8(), alpha: cursor.u8() })
  }
  return { id, version, entries }
}

/** 对象分片的拼接状态；首片声明总长度（含 4 字节宽高），末片出现后校验 */
interface PendingObject {
  id: number
  version: number
  width: number
  height: number
  expected: number
  chunks: Uint8Array[]
  length: number
}

/** 解析一个显示集；任何结构问题都抛出带原因码的 PgsError，不返回部分结果 */
export function parseDisplaySet(data: Uint8Array): DisplaySet {
  let composition: Composition | undefined
  let ended = false
  const windows: WindowDefinition[] = []
  const palettes: PaletteDefinition[] = []
  const objects: ObjectDefinition[] = []
  let pending: PendingObject | undefined

  for (let offset = 0; offset < data.length;) {
    if (ended) throw new PgsError('segment_invalid', '结束段之后仍有数据')
    if (offset + 3 > data.length) throw new PgsError('segment_invalid', '段头被截断')
    const type = data[offset]
    const length = (data[offset + 1] << 8) | data[offset + 2]
    const start = offset + 3
    const end = start + length
    if (end > data.length) throw new PgsError('segment_invalid', '段长度超出块数据范围')
    const payload = data.subarray(start, end)
    offset = end

    switch (type) {
      case SegmentType.composition:
        if (composition) throw new PgsError('segment_invalid', '一个显示集出现多个合成段')
        composition = parseComposition(payload)
        break
      case SegmentType.window:
        windows.push(...parseWindows(payload))
        break
      case SegmentType.palette:
        palettes.push(parsePalette(payload))
        break
      case SegmentType.object: {
        const cursor = new Cursor(payload, '对象段')
        const id = cursor.u16()
        const version = cursor.u8()
        const sequence = cursor.u8()
        const first = (sequence & 0x80) !== 0
        const last = (sequence & 0x40) !== 0
        if (first) {
          if (pending) throw new PgsError('object_incomplete', '对象分片缺少末片')
          const expected = cursor.u24()
          const width = cursor.u16()
          const height = cursor.u16()
          // 声明长度包含宽高 4 字节
          pending = { id, version, width, height, expected: expected - 4, chunks: [], length: 0 }
        } else if (!pending || pending.id !== id) {
          throw new PgsError('object_incomplete', '对象分片缺少首片')
        }
        const chunk = cursor.rest()
        pending.chunks.push(chunk)
        pending.length += chunk.length
        if (last) {
          if (pending.length !== pending.expected)
            throw new PgsError('object_incomplete', '对象数据长度与声明不符')
          const rle = new Uint8Array(pending.length)
          let at = 0
          for (const part of pending.chunks) {
            rle.set(part, at)
            at += part.length
          }
          objects.push({ id, version: pending.version, width: pending.width, height: pending.height, rle })
          pending = undefined
        }
        break
      }
      case SegmentType.end:
        ended = true
        break
      default:
        throw new PgsError('segment_invalid', `未知段类型 0x${type.toString(16)}`)
    }
  }

  if (pending) throw new PgsError('object_incomplete', '对象分片缺少末片')
  if (!composition) throw new PgsError('composition_missing', '显示集缺少合成段')
  if (!ended) throw new PgsError('composition_missing', '显示集缺少结束段')
  return { composition, windows, palettes, objects }
}
