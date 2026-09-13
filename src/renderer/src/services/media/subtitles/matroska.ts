/** 字幕消费者借用来源，不拥有关闭来源的权限。end 为排他边界。 */
export interface SubtitleSource {
  size: number
  read: (start: number, end: number, signal?: AbortSignal) => Promise<Uint8Array>
}

interface Element {
  id: number
  start: number
  end: number
  unknown: boolean
}

export interface EmbeddedSubtitleTrack {
  number: number
  uid: string
  codec: string
  title: string
  language: string
  default: boolean
  forced: boolean
  header: string
  defaultDuration: number
  supported: boolean
  unsupportedReason?: string
}

export interface SubtitleCue {
  start: number
  end: number
  text: string
}

const textDecoder = new TextDecoder('utf-8', { fatal: true })
const segmentIds = new Set([
  0x114D9B74, 0x1549A966, 0x1654AE6B, 0x1F43B675, 0x1C53BB6B, 0x1941A469, 0x1043A770, 0x1254C367,
])
const supportedCodecs = new Set(['S_TEXT/ASS', 'S_TEXT/SSA', 'S_ASS', 'S_SSA', 'S_TEXT/UTF8'])

function vint(bytes: Uint8Array, offset: number, keepMarker = false) {
  const first = bytes[offset]
  if (!first) throw new Error('无效的 EBML 变长整数')
  let width = 1
  while (!(first & (0x80 >> (width - 1)))) width++
  if (offset + width > bytes.length) throw new Error('EBML 头部被截断')
  let value = BigInt(keepMarker ? first : first & (0xFF >> width))
  for (let i = 1; i < width; i++) value = value * 256n + BigInt(bytes[offset + i])
  return { width, value, unknown: !keepMarker && value === (1n << BigInt(width * 7)) - 1n }
}

class Reader {
  // EBML 扫描有大量相邻的小头部；合并读取，避免每个十几字节都产生 Blob/Range 往返。
  // 仅保留一个 1 MiB 窗口，跳过大块时按新位置读取，不缓存整部影片。
  private windowStart = 0
  private window: Uint8Array = new Uint8Array()

  constructor(
    readonly source: SubtitleSource,
    readonly signal?: AbortSignal,
    private readonly readAhead = 0,
  ) {}

  async bytes(start: number, end: number) {
    this.signal?.throwIfAborted()
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end < start ||
      end > this.source.size
    )
      throw new Error('字幕读取范围越界')
    const windowEnd = this.windowStart + this.window.byteLength
    if (start >= this.windowStart && end <= windowEnd)
      return this.window.subarray(start - this.windowStart, end - this.windowStart)
    const readEnd = Math.min(this.source.size, Math.max(end, start + this.readAhead))
    const bytes = await this.source.read(start, readEnd, this.signal)
    this.signal?.throwIfAborted()
    if (bytes.length !== readEnd - start) throw new Error('媒体文件短读或已变化')
    if (this.readAhead > 0 && bytes.byteLength <= this.readAhead) {
      this.windowStart = start
      this.window = bytes
    }
    return bytes.subarray(0, end - start)
  }

  async element(offset: number, limit: number): Promise<Element> {
    const bytes = await this.bytes(offset, Math.min(limit, offset + 12))
    const id = vint(bytes, 0, true)
    if (id.width > 4) throw new Error('EBML ID 超长')
    const size = vint(bytes, id.width)
    const start = offset + id.width + size.width
    const end = size.unknown ? limit : start + Number(size.value)
    if (!Number.isSafeInteger(end) || end > limit || start > end)
      throw new Error('EBML 元素超出容器')
    return { id: Number(id.value), start, end, unknown: size.unknown }
  }

  async *children(parent: Element) {
    for (let offset = parent.start; offset < parent.end;) {
      const child = await this.element(offset, parent.end)
      if (child.unknown) throw new Error('不支持此层级的未知长度元素')
      yield child
      offset = child.end
    }
  }

  async value(element: Element) {
    if (element.end - element.start > 4 * 1024 * 1024) throw new Error('字幕字段超过 4 MiB 预算')
    return this.bytes(element.start, element.end)
  }

  async uint(element: Element) {
    const bytes = await this.value(element)
    if (!bytes.length || bytes.length > 8) throw new Error('无效的 EBML 无符号整数')
    let value = 0n
    for (const byte of bytes) value = value * 256n + BigInt(byte)
    return value
  }

  async text(element: Element) {
    return textDecoder.decode(await this.value(element)).replace(/\0+$/, '')
  }
}

/** 只补充字幕输入；音视频和附件仍交给 MediaBunny。 */
export class MatroskaSubtitles {
  private constructor(
    private readonly source: SubtitleSource,
    private readonly segment: Element,
    readonly tracks: readonly EmbeddedSubtitleTrack[],
    private readonly timestampScale: number,
  ) {}

  static async open(source: SubtitleSource, signal?: AbortSignal) {
    const reader = new Reader(source, signal, 1024 * 1024)
    let segment: Element | undefined
    for (let offset = 0; offset < source.size;) {
      const element = await reader.element(offset, source.size)
      if (element.id === 0x18538067) {
        segment = element
        break
      }
      if (element.unknown) throw new Error('无效的 MKV 顶层元素')
      offset = element.end
    }
    if (!segment) throw new Error('找不到 Matroska Segment')
    let scale = 1000000
    let hasInfo = false
    let hasTracks = false
    const tracks: EmbeddedSubtitleTrack[] = []
    for (let offset = segment.start; offset < segment.end;) {
      const element = await reader.element(offset, segment.end)
      if (element.id === 0x1549A966) {
        for await (const field of reader.children(element)) {
          if (field.id === 0x2AD7B1) scale = Number(await reader.uint(field))
        }
        hasInfo = true
      } else if (element.id === 0x1654AE6B) {
        for await (const entry of reader.children(element)) {
          if (entry.id !== 0xAE) continue
          const track = await readTrack(reader, entry)
          if (track) tracks.push(track)
        }
        hasTracks = true
      }
      if (hasInfo && hasTracks) break
      offset = await skipElement(reader, element)
    }
    if (!Number.isSafeInteger(scale) || scale <= 0) throw new Error('无效的字幕时间单位')
    return new MatroskaSubtitles(source, segment, tracks, scale / 1e9)
  }

  async *cues(trackNumber: number, signal?: AbortSignal): AsyncGenerator<SubtitleCue> {
    const track = this.tracks.find((track) => track.number === trackNumber)
    if (!track || !track.supported) throw new Error(track?.unsupportedReason ?? '字幕轨道不存在')
    // 索引读取完整成功后才交付，坏索引回到原扫描，避免重复交付半条轨道。
    const indexed = await this.indexedCues(track, signal)
    if (indexed) {
      for (const cue of indexed) {
        signal?.throwIfAborted()
        yield cue
      }
      return
    }
    const reader = new Reader(this.source, signal, 1024 * 1024)
    // 逐事件产出，不把整部影片或全部字幕预读到内存。
    for (let offset = this.segment.start; offset < this.segment.end;) {
      const cluster = await reader.element(offset, this.segment.end)
      if (cluster.id !== 0x1F43B675) {
        offset = await skipElement(reader, cluster)
        continue
      }
      let timestamp = 0
      let hasTimestamp = false
      let cursor = cluster.start
      while (cursor < cluster.end) {
        const field = await reader.element(cursor, cluster.end)
        if (cluster.unknown && segmentIds.has(field.id)) break
        if (field.unknown) throw new Error('字幕 Cluster 子元素长度未知')
        if (field.id === 0xE7) {
          timestamp = Number(await reader.uint(field))
          hasTimestamp = true
        }
        if (field.id === 0xA0 || field.id === 0xA3) {
          if (!hasTimestamp) throw new Error('字幕块缺少 Cluster 时间')
          let block: Element | undefined = field.id === 0xA3 ? field : undefined
          let duration = track.defaultDuration
          if (field.id === 0xA0) {
            for await (const item of reader.children(field)) {
              if (item.id === 0xA1) block = item
              if (item.id === 0x9B) duration = Number(await reader.uint(item)) * this.timestampScale
            }
          }
          if (block) {
            const prefix = await reader.bytes(block.start, Math.min(block.end, block.start + 11))
            const number = vint(prefix, 0)
            if (number.value === BigInt(trackNumber)) {
              if (prefix.length < number.width + 3 || prefix[number.width + 2] & 6)
                throw new Error('字幕块截断或使用不支持的 lacing')
              if (!(duration > 0)) throw new Error('字幕块缺少有效时长')
              const relative = new DataView(prefix.buffer, prefix.byteOffset).getInt16(number.width)
              const start = (timestamp + relative) * this.timestampScale
              const payload = { ...block, start: block.start + number.width + 3 }
              yield { start, end: start + duration, text: await reader.text(payload) }
            }
          }
        }
        cursor = field.end
      }
      offset = cursor
    }
  }

  private async indexedCues(track: EmbeddedSubtitleTrack, signal?: AbortSignal) {
    try {
      // SeekHead 通常位于 Segment 开头；只在首个 Cluster 前寻找，缺失时直接走扫描。
      const metadata = new Reader(this.source, signal, 64 * 1024)
      let index: Element | undefined
      for (let offset = this.segment.start; offset < this.segment.end;) {
        const entry = await metadata.element(offset, this.segment.end)
        if (entry.id === 0x1F43B675) break
        if (entry.id === 0x1C53BB6B) {
          index = entry
          break
        }
        if (entry.id === 0x114D9B74) {
          for await (const seek of metadata.children(entry)) {
            if (seek.id !== 0x4DBB) continue
            let id = 0
            let position = -1
            for await (const field of metadata.children(seek)) {
              if (field.id === 0x53AB) id = Number(await metadata.uint(field))
              if (field.id === 0x53AC) position = Number(await metadata.uint(field))
            }
            if (id === 0x1C53BB6B && position >= 0) {
              index = await metadata.element(this.segment.start + position, this.segment.end)
              if (index.id !== 0x1C53BB6B) return null
              break
            }
          }
        }
        if (index) break
        offset = await skipElement(metadata, entry)
      }
      if (!index || index.unknown || index.end - index.start > 8 * 1024 * 1024) return null
      const targets: { time: number; cluster: number; relative: number }[] = []
      for await (const point of metadata.children(index)) {
        if (point.id !== 0xBB) continue
        let time = -1
        const positions: { track: number; cluster: number; relative: number }[] = []
        for await (const field of metadata.children(point)) {
          if (field.id === 0xB3) time = Number(await metadata.uint(field))
          if (field.id !== 0xB7) continue
          const position = { track: -1, cluster: -1, relative: -1 }
          for await (const value of metadata.children(field)) {
            if (value.id === 0xF7) position.track = Number(await metadata.uint(value))
            if (value.id === 0xF1) position.cluster = Number(await metadata.uint(value))
            if (value.id === 0xF0) position.relative = Number(await metadata.uint(value))
          }
          positions.push(position)
        }
        for (const position of positions) {
          if (position.track !== track.number) continue
          if (![time, position.cluster, position.relative].every((value) => Number.isSafeInteger(value) && value >= 0)) return null
          targets.push({ time, cluster: position.cluster, relative: position.relative })
          if (targets.length > 100000) return null
        }
      }
      if (!targets.length) return null
      const cues: SubtitleCue[] = []
      let next = 0
      let size = track.header.length
      const seen = new Set<number>()
      const clusters = new Map<number, Promise<Element>>()
      // 有界并发隐藏本地 Range 往返；每个读取器仅预读小块，限制无关视频载荷的读取量。
      const results = await Promise.allSettled(
        Array.from({ length: Math.min(8, targets.length) }, async () => {
          const reader = new Reader(this.source, signal, 1024)
          while (next < targets.length) {
            signal?.throwIfAborted()
            const i = next++
            const target = targets[i]
            let pending = clusters.get(target.cluster)
            if (!pending) {
              pending = reader.element(this.segment.start + target.cluster, this.segment.end)
              clusters.set(target.cluster, pending)
            }
            const cluster = await pending
            if (cluster.id !== 0x1F43B675) throw new Error('字幕索引未指向 Cluster')
            const address = cluster.start + target.relative
            if (address < cluster.start || seen.has(address))
              throw new Error('字幕索引位置重复或越界')
            seen.add(address)
            const group = await reader.element(address, cluster.end)
            if (group.unknown) throw new Error('字幕索引块长度未知')
            let block: Element | undefined = group.id === 0xA3 ? group : undefined
            let duration = track.defaultDuration
            if (group.id === 0xA0) {
              for await (const item of reader.children(group)) {
                if (item.id === 0xA1) block = item
                if (item.id === 0x9B)
                  duration = Number(await reader.uint(item)) * this.timestampScale
              }
            }
            if (!block || !(duration > 0)) throw new Error('字幕索引缺少文本块或时长')
            const prefix = await reader.bytes(block.start, Math.min(block.end, block.start + 11))
            const number = vint(prefix, 0)
            if (
              number.value !== BigInt(track.number) ||
              prefix.length < number.width + 3 ||
              prefix[number.width + 2] & 6
            )
              throw new Error('字幕索引轨道不匹配或块格式无效')
            const text = await reader.text({ ...block, start: block.start + number.width + 3 })
            size += text.length
            if (size > 8 * 1024 * 1024) throw new Error('字幕文本超过预算')
            const start = target.time * this.timestampScale
            cues[i] = { start, end: start + duration, text }
          }
        }),
      )
      const failed = results.find((result) => result.status === 'rejected')
      if (failed?.status === 'rejected') throw failed.reason
      return cues
    } catch {
      signal?.throwIfAborted()
      return null
    }
  }
}

async function skipElement(reader: Reader, element: Element) {
  if (!element.unknown) return element.end
  if (element.id !== 0x1F43B675) throw new Error('不支持的未知长度元素')
  for (let offset = element.start; offset < element.end;) {
    const field = await reader.element(offset, element.end)
    if (segmentIds.has(field.id)) return offset
    if (field.unknown) throw new Error('Cluster 内部元素长度未知')
    offset = field.end
  }
  return element.end
}

async function readTrack(reader: Reader, entry: Element) {
  const track: EmbeddedSubtitleTrack = {
    number: 0,
    uid: '',
    codec: '',
    title: '',
    language: 'eng',
    default: true,
    forced: false,
    header: '',
    defaultDuration: 0,
    supported: false,
  }
  let type = 0
  let languageIetf = ''
  let encoded = false
  let scaled = false
  for await (const field of reader.children(entry)) {
    switch (field.id) {
      case 0x83:
        type = Number(await reader.uint(field))
        break
      case 0xD7:
        track.number = Number(await reader.uint(field))
        break
      case 0x73C5:
        track.uid = String(await reader.uint(field))
        break
      case 0x86:
        track.codec = await reader.text(field)
        break
      case 0x536E:
        track.title = await reader.text(field)
        break
      case 0x22B59C:
        track.language = await reader.text(field)
        break
      case 0x22B59D:
        languageIetf = await reader.text(field)
        break
      case 0x88:
        track.default = Boolean(await reader.uint(field))
        break
      case 0x55AA:
        track.forced = Boolean(await reader.uint(field))
        break
      case 0x23E383:
        track.defaultDuration = Number(await reader.uint(field)) / 1e9
        break
      case 0x6D80:
        encoded = true
        break
      case 0x23314F: {
        const bytes = await reader.value(field)
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        const value =
          bytes.length === 4 ? view.getFloat32(0) : bytes.length === 8 ? view.getFloat64(0) : NaN
        scaled = value !== 1
        break
      }
    }
  }
  if (type !== 17) return null
  if (!Number.isSafeInteger(track.number) || track.number <= 0) throw new Error('无效字幕轨编号')
  track.language = languageIetf || track.language
  track.supported = supportedCodecs.has(track.codec) && !encoded && !scaled
  if (!track.supported)
    track.unsupportedReason = encoded
      ? '暂不支持压缩或加密字幕轨'
      : scaled
        ? '暂不支持独立字幕时间缩放'
        : '暂不支持此字幕编码（含图片字幕）'
  // 只有文本字幕才解读 CodecPrivate，避免把图片或压缩私有数据当 UTF-8。
  if (track.supported) {
    for await (const field of reader.children(entry))
      if (field.id === 0x63A2) track.header = await reader.text(field)
  }
  return track
}

/** Matroska ASS 数据不含起止时间；按容器时间还原，文本中的逗号原样保留。 */
export function assDialogue(cue: SubtitleCue, codec: string) {
  const fields = cue.text.split(',')
  if (fields.length < 9) throw new Error('ASS 字幕事件字段不足')
  const [order, layer, ...rest] = fields
  if (!/^\d+$/.test(order)) throw new Error('ASS ReadOrder 无效')
  const first = codec.endsWith('SSA') ? 'Marked=0' : layer || '0'
  return {
    order: Number(order),
    line: `Dialogue: ${first},${assTime(cue.start)},${assTime(cue.end)},${rest.join(',')}`,
  }
}

function assTime(seconds: number) {
  if (!Number.isFinite(seconds)) throw new Error('字幕时间无效')
  const cs = Math.max(0, Math.round(seconds * 100))
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, '0')}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`
}

export const FONT_ATTACHMENT_BUDGET = 32 * 1024 * 1024

/** 只扫描结构头并跳过载荷；未知长度和损坏结构交由调用方回退字体。 */
export async function preflightMatroskaAttachments(source: SubtitleSource, signal?: AbortSignal) {
  const reader = new Reader(source, signal)
  let total = 0
  let segments = 0
  for (let cursor = 0; cursor < source.size;) {
    const root = await reader.element(cursor, source.size)
    if (root.id === 0x18538067) {
      segments++
      for (let offset = root.start; offset < root.end;) {
        const element = await reader.element(offset, root.end)
        if (element.id === 0x1941A469) {
          if (element.unknown) throw new Error('附件大小未知，使用默认字体')
          total += element.end - offset
          if (total > FONT_ATTACHMENT_BUDGET) return { allowed: false, bytes: total }
        }
        offset = await skipElement(reader, element)
      }
    } else if (root.unknown) throw new Error('媒体结构无法预检，使用默认字体')
    cursor = root.end
  }
  if (!segments) throw new Error('附件预检未找到 Matroska Segment')
  return { allowed: true, bytes: total }
}
