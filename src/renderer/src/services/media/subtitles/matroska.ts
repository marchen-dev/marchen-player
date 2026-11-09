import type { SubtitleFailureReason } from '@marchen/shared/media'
import { SubtitleError } from '@marchen/shared/media'

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

/** 文本字幕交给 libass；位图字幕（PGS）走独立的窗口加载与位图渲染 */
export type SubtitleTrackKind = 'text' | 'bitmap'

/** 视频轨的传递函数，只用来决定位图字幕是否需要 HDR 提亮；容器未声明时为 undefined */
export type VideoTransfer = 'pq' | 'hlg' | 'sdr'

/** 某条轨道的一个 Cues 索引项；cluster 为文件内的绝对偏移，relative 相对 Cluster 数据起点 */
export interface CuePosition {
  /** 块的绝对时间（秒） */
  time: number
  cluster: number
  relative: number
}

export interface EmbeddedSubtitleTrack {
  number: number
  uid: string
  codec: string
  kind: SubtitleTrackKind
  title: string
  language: string
  default: boolean
  forced: boolean
  header: string
  defaultDuration: number
  supported: boolean
  /** 面向用户的不支持原因 */
  unsupportedReason?: string
  /** 面向遥测聚合的稳定不支持原因 */
  unsupportedCode?: UnsupportedSubtitleCode
}

/** 内嵌轨不支持的稳定原因；codec 为未接入的文本或未知格式 */
export type UnsupportedSubtitleCode =
  | 'codec'
  /** 未接入的图片字幕（VobSub、DVB 等）；PGS 已支持 */
  | 'bitmap_codec'
  /** 位图字幕需要按索引定位，文件完全没有 Cues */
  | 'missing_index'
  | 'encrypted'
  | 'compression_algo'
  | 'multi_encoding'
  | 'time_scale'

export interface SubtitleCue {
  start: number
  end: number
  text: string
}

/**
 * 轨道内容压缩（Matroska ContentEncoding）。mkvmerge 常对文本字幕开 zlib，
 * 解码与 codec 无关，后续位图字幕可直接复用。只支持单层压缩，加密一律拒绝。
 */
interface ContentCompression {
  /** 0 = zlib，3 = 头部剥离 */
  algo: 0 | 3
  /** 头部剥离时被剥掉的公共前缀；zlib 不使用 */
  settings: Uint8Array
  /** 按位：1 = Block 数据，2 = CodecPrivate */
  scope: number
}

const textDecoder = new TextDecoder('utf-8', { fatal: true })
/** 逃出到调用方的错误统一带稳定原因码；只在内部消化的索引与附件预检路径保持普通 Error */
const fail = (reason: SubtitleFailureReason, message: string, options?: ErrorOptions) =>
  new SubtitleError(reason, message, options)
/** 单块解压上限，与单字段读取预算一致，防止压缩炸弹撑爆内存 */
const INFLATE_BUDGET = 4 * 1024 * 1024
const segmentIds = new Set([
  0x114D9B74, 0x1549A966, 0x1654AE6B, 0x1F43B675, 0x1C53BB6B, 0x1941A469, 0x1043A770, 0x1254C367,
])
const supportedCodecs = new Set(['S_TEXT/ASS', 'S_TEXT/SSA', 'S_ASS', 'S_SSA', 'S_TEXT/UTF8'])
/** 已接入的位图字幕 */
const bitmapCodecs = new Set(['S_HDMV/PGS'])
/** 尚未接入的图片字幕，单独给出原因，方便用户理解与遥测聚合 */
const unsupportedImageCodecs = new Set(['S_VOBSUB', 'S_DVBSUB', 'S_IMAGE/BMP'])

function vint(bytes: Uint8Array, offset: number, keepMarker = false) {
  const first = bytes[offset]
  if (!first) throw fail('container_invalid', '无效的 EBML 变长整数')
  let width = 1
  while (!(first & (0x80 >> (width - 1)))) width++
  if (offset + width > bytes.length) throw fail('container_invalid', 'EBML 头部被截断')
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
      throw fail('read_failed', '字幕读取范围越界')
    const windowEnd = this.windowStart + this.window.byteLength
    if (start >= this.windowStart && end <= windowEnd)
      return this.window.subarray(start - this.windowStart, end - this.windowStart)
    const readEnd = Math.min(this.source.size, Math.max(end, start + this.readAhead))
    const bytes = await this.source.read(start, readEnd, this.signal)
    this.signal?.throwIfAborted()
    if (bytes.length !== readEnd - start) throw fail('read_failed', '媒体文件短读或已变化')
    if (this.readAhead > 0 && bytes.byteLength <= this.readAhead) {
      this.windowStart = start
      this.window = bytes
    }
    return bytes.subarray(0, end - start)
  }

  async element(offset: number, limit: number): Promise<Element> {
    const bytes = await this.bytes(offset, Math.min(limit, offset + 12))
    const id = vint(bytes, 0, true)
    if (id.width > 4) throw fail('container_invalid', 'EBML ID 超长')
    const size = vint(bytes, id.width)
    const start = offset + id.width + size.width
    const end = size.unknown ? limit : start + Number(size.value)
    if (!Number.isSafeInteger(end) || end > limit || start > end)
      throw fail('container_invalid', 'EBML 元素超出容器')
    return { id: Number(id.value), start, end, unknown: size.unknown }
  }

  async *children(parent: Element) {
    for (let offset = parent.start; offset < parent.end;) {
      const child = await this.element(offset, parent.end)
      if (child.unknown) throw fail('container_invalid', '不支持此层级的未知长度元素')
      yield child
      offset = child.end
    }
  }

  async value(element: Element) {
    if (element.end - element.start > 4 * 1024 * 1024) throw fail('too_large', '字幕字段超过 4 MiB 预算')
    return this.bytes(element.start, element.end)
  }

  async uint(element: Element) {
    const bytes = await this.value(element)
    if (!bytes.length || bytes.length > 8) throw fail('container_invalid', '无效的 EBML 无符号整数')
    let value = 0n
    for (const byte of bytes) value = value * 256n + BigInt(byte)
    return value
  }

  async text(element: Element) {
    return decodeText(await this.value(element))
  }

  /** 读取字段并按轨道内容编码还原；scopeBit 指明该字段是否在压缩范围内 */
  async encodedBytes(element: Element, compression: ContentCompression | undefined, scopeBit: number) {
    const bytes = await this.value(element)
    if (!compression || !(compression.scope & scopeBit)) return bytes
    return decompress(bytes, compression, this.signal)
  }

  /** 读取字段并按轨道内容编码还原后再解码文本 */
  async encodedText(element: Element, compression: ContentCompression | undefined, scopeBit: number) {
    return decodeText(await this.encodedBytes(element, compression, scopeBit))
  }
}

function decodeText(bytes: Uint8Array) {
  try {
    return textDecoder.decode(bytes).replace(/\0+$/, '')
  } catch (error) {
    throw fail('text_encoding', '字幕文本不是有效的 UTF-8', { cause: error })
  }
}

async function decompress(
  bytes: Uint8Array,
  compression: ContentCompression,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (compression.algo === 3) {
    const restored = new Uint8Array(compression.settings.length + bytes.length)
    restored.set(compression.settings)
    restored.set(bytes, compression.settings.length)
    return restored
  }
  // DecompressionStream('deflate') 即带 zlib 头的 RFC 1950 格式，与 Matroska zlib 一致。
  const stream = new DecompressionStream('deflate')
  const writer = stream.writable.getWriter()
  // 写入错误会在读取端以同样的异常出现，这里吞掉避免未处理的 Promise 拒绝。
  writer.write(bytes.slice()).catch(() => {})
  writer.close().catch(() => {})
  const reader = stream.readable.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      signal?.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > INFLATE_BUDGET) break
      chunks.push(value)
    }
  } catch (error) {
    reader.cancel().catch(() => {})
    signal?.throwIfAborted()
    throw fail('decompress_failed', '字幕块解压失败', { cause: error })
  }
  if (total > INFLATE_BUDGET) {
    reader.cancel().catch(() => {})
    throw fail('too_large', '字幕块解压后超过 4 MiB 预算')
  }
  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

/** 只补充字幕输入；音视频和附件仍交给 MediaBunny。 */
export class MatroskaSubtitles {
  private constructor(
    private readonly source: SubtitleSource,
    private readonly segment: Element,
    readonly tracks: readonly EmbeddedSubtitleTrack[],
    private readonly timestampScale: number,
    /** 轨道号 → 内容压缩；不放进公开的轨道元数据，避免进入目录或历史记录 */
    private readonly compressions: ReadonlyMap<number, ContentCompression>,
    /** 第一条视频轨；位图字幕缺少自身索引时借它的 Cues 定位 */
    readonly video: { number: number; transfer?: VideoTransfer } | undefined,
    /**
     * SeekHead 中登记的 Cues 绝对位置。null 表示有 SeekHead 但没有 Cues 条目，
     * undefined 表示没有 SeekHead（需要时再在首个 Cluster 前寻找）。
     */
    private readonly cuesOffset: number | null | undefined,
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
      if (element.unknown) throw fail('container_invalid', '无效的 MKV 顶层元素')
      offset = element.end
    }
    if (!segment) throw fail('container_invalid', '找不到 Matroska Segment')
    let scale = 1000000
    let hasInfo = false
    let hasTracks = false
    let cuesOffset: number | null | undefined
    let video: { number: number; transfer?: VideoTransfer } | undefined
    const tracks: EmbeddedSubtitleTrack[] = []
    const compressions = new Map<number, ContentCompression>()
    for (let offset = segment.start; offset < segment.end;) {
      const element = await reader.element(offset, segment.end)
      if (element.id === 0x114D9B74 && cuesOffset === undefined) {
        // 只看第一个 SeekHead；结构损坏时不影响字幕目录，当作“未知”，留到真正读取时再找
        cuesOffset = await readSeekCues(reader, element, segment.start).catch(() => {
          signal?.throwIfAborted()
          return undefined
        })
      } else if (element.id === 0x1C53BB6B && cuesOffset == null) {
        cuesOffset = offset
      } else if (element.id === 0x1549A966) {
        for await (const field of reader.children(element)) {
          if (field.id === 0x2AD7B1) scale = Number(await reader.uint(field))
        }
        hasInfo = true
      } else if (element.id === 0x1654AE6B) {
        for await (const entry of reader.children(element)) {
          if (entry.id !== 0xAE) continue
          if (!video) video = await readVideoTrack(reader, entry)
          const result = await readTrack(reader, entry)
          if (!result) continue
          tracks.push(result.track)
          if (result.compression) compressions.set(result.track.number, result.compression)
        }
        hasTracks = true
      }
      if (hasInfo && hasTracks) break
      offset = await skipElement(reader, element)
    }
    if (!Number.isSafeInteger(scale) || scale <= 0) throw fail('container_invalid', '无效的字幕时间单位')
    // 位图字幕必须按索引定位；SeekHead 明确没有 Cues 时，整个文件都没有可用索引。
    if (cuesOffset === null) {
      for (const track of tracks) {
        if (track.kind !== 'bitmap' || !track.supported) continue
        track.supported = false
        track.unsupportedCode = 'missing_index'
        track.unsupportedReason = '文件缺少索引，暂不支持此图片字幕'
      }
    }
    return new MatroskaSubtitles(source, segment, tracks, scale / 1e9, compressions, video, cuesOffset)
  }

  async *cues(trackNumber: number, signal?: AbortSignal): AsyncGenerator<SubtitleCue> {
    const track = this.tracks.find((track) => track.number === trackNumber)
    if (!track) throw fail('track_missing', '字幕轨道不存在')
    if (!track.supported)
      throw fail('unsupported_format', track.unsupportedReason ?? '暂不支持此字幕轨')
    if (track.kind !== 'text') throw fail('unsupported_format', '图片字幕不能按文本读取')
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
    const compression = this.compressions.get(trackNumber)
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
        if (field.unknown) throw fail('container_invalid', '字幕 Cluster 子元素长度未知')
        if (field.id === 0xE7) {
          timestamp = Number(await reader.uint(field))
          hasTimestamp = true
        }
        if (field.id === 0xA0 || field.id === 0xA3) {
          if (!hasTimestamp) throw fail('block_invalid', '字幕块缺少 Cluster 时间')
          let block: Element | undefined = field.id === 0xA3 ? field : undefined
          let duration = track.defaultDuration
          let explicitDuration = false
          if (field.id === 0xA0) {
            for await (const item of reader.children(field)) {
              if (item.id === 0xA1) block = item
              if (item.id === 0x9B) {
                duration = Number(await reader.uint(item)) * this.timestampScale
                explicitDuration = true
              }
            }
          }
          if (block) {
            const prefix = await reader.bytes(block.start, Math.min(block.end, block.start + 11))
            const number = vint(prefix, 0)
            if (number.value === BigInt(trackNumber)) {
              if (prefix.length < number.width + 3 || prefix[number.width + 2] & 6)
                throw fail('block_invalid', '字幕块截断或使用不支持的 lacing')
              const relative = new DataView(prefix.buffer, prefix.byteOffset).getInt16(number.width)
              const start = (timestamp + relative) * this.timestampScale
              const payload = { ...block, start: block.start + number.width + 3 }
              const text = await reader.encodedText(payload, compression, 1)
              if (!skipZeroDurationEvent(track.codec, text, duration, explicitDuration))
                yield { start, end: start + duration, text }
            }
          }
        }
        cursor = field.end
      }
      offset = cursor
    }
  }

  /**
   * 按 Cues 找到某条轨道的全部索引项（Cues 本身按时间排序）。
   * 没有 Cues、索引损坏或该轨没有索引项时返回 null；只有取消会抛出。
   */
  async cueIndex(trackNumber: number, signal?: AbortSignal): Promise<CuePosition[] | null> {
    try {
      const metadata = new Reader(this.source, signal, 64 * 1024)
      const index = await this.findCues(metadata)
      if (!index || index.unknown || index.end - index.start > 8 * 1024 * 1024) return null
      const positions: CuePosition[] = []
      for await (const point of metadata.children(index)) {
        if (point.id !== 0xBB) continue
        let time = -1
        const entries: { track: number; cluster: number; relative: number }[] = []
        for await (const field of metadata.children(point)) {
          if (field.id === 0xB3) time = Number(await metadata.uint(field))
          if (field.id !== 0xB7) continue
          const entry = { track: -1, cluster: -1, relative: -1 }
          for await (const value of metadata.children(field)) {
            if (value.id === 0xF7) entry.track = Number(await metadata.uint(value))
            if (value.id === 0xF1) entry.cluster = Number(await metadata.uint(value))
            if (value.id === 0xF0) entry.relative = Number(await metadata.uint(value))
          }
          entries.push(entry)
        }
        for (const entry of entries) {
          if (entry.track !== trackNumber) continue
          if (
            ![time, entry.cluster, entry.relative].every(
              (value) => Number.isSafeInteger(value) && value >= 0,
            )
          )
            return null
          positions.push({
            time: time * this.timestampScale,
            cluster: this.segment.start + entry.cluster,
            relative: entry.relative,
          })
          if (positions.length > 100000) return null
        }
      }
      return positions.length ? positions : null
    } catch {
      signal?.throwIfAborted()
      return null
    }
  }

  /**
   * 按索引读取单个字幕块并按轨道内容编码还原。
   * 每个块一次读 64 KB（块更大时补读）；Cluster 头按 Cluster 缓存，同一 Cluster 内的后续块只需一次请求。
   * 返回的数据是独立副本，可以跨读取长期保留。
   */
  async readCueBlock(trackNumber: number, position: CuePosition, signal?: AbortSignal) {
    const track = this.tracks.find((track) => track.number === trackNumber)
    if (!track) throw fail('track_missing', '字幕轨道不存在')
    try {
      const block = await this.readIndexedBlock(
        new Reader(this.source, signal),
        new Reader(this.source, signal, 64 * 1024),
        this.clusterHeaders,
        position,
        track,
        this.compressions.get(trackNumber),
      )
      return { time: position.time, duration: block.explicitDuration ? block.duration : undefined, data: block.data.slice() }
    } catch (error) {
      signal?.throwIfAborted()
      if (error instanceof SubtitleError) throw error
      throw fail('block_invalid', error instanceof Error ? error.message : '字幕块读取失败', { cause: error })
    }
  }

  /** Cluster 位置 → Cluster 元素；失败的读取不缓存，避免一次取消毒化后续读取 */
  private readonly clusterHeaders = new Map<number, Promise<Element>>()
  /** 视频轨 Cues，缺少字幕索引时用来定位扫描起点；只解析一次 */
  private videoCues?: Promise<CuePosition[] | null>

  /**
   * 缺少字幕索引时的有限扫描：借视频 Cues 找到 from 之前最近的 Cluster，
   * 顺序扫描到 Cluster 时间超过 to 为止，返回 [from, to] 内该轨字幕块的位置。
   *
   * 使用 256 KB 预读窗口（门槛实验选定）：只解析元素头和本轨块头，其余块按长度跳过。
   * 单次跨度不超过 maxSpan 秒，调用方按需分段；不会退化为全片扫描。
   */
  async scanBlocks(
    trackNumber: number,
    from: number,
    to: number,
    signal?: AbortSignal,
    maxSpan = 40,
  ): Promise<CuePosition[]> {
    if (!(to >= from) || to - from > maxSpan) throw fail('read_failed', '字幕扫描范围无效')
    if (!this.video) throw fail('container_invalid', '缺少视频轨，无法定位字幕')
    this.videoCues ??= this.cueIndex(this.video.number, signal)
    const videoCues = await this.videoCues.catch((error) => {
      this.videoCues = undefined
      throw error
    })
    if (!videoCues) {
      this.videoCues = undefined
      throw fail('container_invalid', '文件缺少可用于定位的索引')
    }
    let start = videoCues[0].cluster
    for (const cue of videoCues) {
      if (cue.time > from) break
      start = cue.cluster
    }
    const reader = new Reader(this.source, signal, 256 * 1024)
    const found: CuePosition[] = []
    for (let offset = start; offset < this.segment.end;) {
      const cluster = await reader.element(offset, this.segment.end)
      if (cluster.id !== 0x1F43B675) {
        // 扫描途中遇到 Cues、Tags 等非 Cluster 元素时跳过
        offset = await skipElement(reader, cluster)
        continue
      }
      let timestamp: number | undefined
      let cursor = cluster.start
      while (cursor < cluster.end) {
        const field = await reader.element(cursor, cluster.end)
        if (cluster.unknown && segmentIds.has(field.id)) break
        if (field.unknown) throw fail('container_invalid', '字幕 Cluster 子元素长度未知')
        if (field.id === 0xE7) {
          timestamp = Number(await reader.uint(field)) * this.timestampScale
          // Cluster 时间已超过范围，后面的 Cluster 也不会更早
          if (timestamp > to) return found
        }
        if (field.id === 0xA0 || field.id === 0xA3) {
          if (timestamp === undefined) throw fail('block_invalid', '字幕块缺少 Cluster 时间')
          let block: Element | undefined = field.id === 0xA3 ? field : undefined
          if (field.id === 0xA0) {
            for await (const item of reader.children(field)) {
              if (item.id === 0xA1) {
                block = item
                break
              }
            }
          }
          if (block) {
            const prefix = await reader.bytes(block.start, Math.min(block.end, block.start + 11))
            const number = vint(prefix, 0)
            if (number.value === BigInt(trackNumber) && prefix.length >= number.width + 2) {
              const relative = new DataView(prefix.buffer, prefix.byteOffset).getInt16(number.width)
              const time = timestamp + relative * this.timestampScale
              if (time >= from && time <= to)
                found.push({ time, cluster: offset, relative: cursor - cluster.start })
            }
          }
        }
        cursor = field.end
      }
      offset = cursor
    }
    return found
  }

  /** SeekHead 已在 open 时解析；没有 SeekHead 时只在首个 Cluster 前寻找 */
  private async findCues(metadata: Reader): Promise<Element | undefined> {
    if (this.cuesOffset === null) return undefined
    if (this.cuesOffset !== undefined) {
      const index = await metadata.element(this.cuesOffset, this.segment.end)
      return index.id === 0x1C53BB6B ? index : undefined
    }
    for (let offset = this.segment.start; offset < this.segment.end;) {
      const entry = await metadata.element(offset, this.segment.end)
      if (entry.id === 0x1F43B675) return undefined
      if (entry.id === 0x1C53BB6B) return entry
      offset = await skipElement(metadata, entry)
    }
    return undefined
  }

  /**
   * 文本与位图共用的按索引读块：定位 Cluster → BlockGroup / SimpleBlock → 校验轨道号与 lacing → 解压。
   * 结构问题抛普通 Error，由调用方决定退回扫描还是转为稳定原因码。
   */
  private async readIndexedBlock(
    clusterReader: Reader,
    blockReader: Reader,
    clusters: Map<number, Promise<Element>>,
    position: CuePosition,
    track: EmbeddedSubtitleTrack,
    compression: ContentCompression | undefined,
  ) {
    let pending = clusters.get(position.cluster)
    if (!pending) {
      pending = clusterReader.element(position.cluster, this.segment.end)
      clusters.set(position.cluster, pending)
      pending.catch(() => clusters.delete(position.cluster))
    }
    const cluster = await pending
    if (cluster.id !== 0x1F43B675) throw new Error('字幕索引未指向 Cluster')
    const address = cluster.start + position.relative
    if (address < cluster.start || address >= cluster.end) throw new Error('字幕索引位置越界')
    const group = await blockReader.element(address, cluster.end)
    if (group.unknown) throw new Error('字幕索引块长度未知')
    let block: Element | undefined = group.id === 0xA3 ? group : undefined
    let duration = track.defaultDuration
    let explicitDuration = false
    if (group.id === 0xA0) {
      for await (const item of blockReader.children(group)) {
        if (item.id === 0xA1) block = item
        if (item.id === 0x9B) {
          duration = Number(await blockReader.uint(item)) * this.timestampScale
          explicitDuration = true
        }
      }
    }
    if (!block) throw new Error('字幕索引缺少数据块')
    const prefix = await blockReader.bytes(block.start, Math.min(block.end, block.start + 11))
    const number = vint(prefix, 0)
    if (
      number.value !== BigInt(track.number) ||
      prefix.length < number.width + 3 ||
      prefix[number.width + 2] & 6
    )
      throw new Error('字幕索引轨道不匹配或块格式无效')
    const data = await blockReader.encodedBytes(
      { ...block, start: block.start + number.width + 3 },
      compression,
      1,
    )
    return { address, data, duration, explicitDuration }
  }

  private async indexedCues(track: EmbeddedSubtitleTrack, signal?: AbortSignal) {
    try {
      const targets = await this.cueIndex(track.number, signal)
      if (!targets) return null
      const cues: (SubtitleCue | undefined)[] = []
      const compression = this.compressions.get(track.number)
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
            const block = await this.readIndexedBlock(reader, reader, clusters, target, track, compression)
            if (seen.has(block.address)) throw new Error('字幕索引位置重复')
            seen.add(block.address)
            const text = decodeText(block.data)
            size += text.length
            if (size > 8 * 1024 * 1024) throw new Error('字幕文本超过预算')
            if (skipZeroDurationEvent(track.codec, text, block.duration, block.explicitDuration))
              continue
            cues[i] = { start: target.time, end: target.time + block.duration, text }
          }
        }),
      )
      const failed = results.find((result) => result.status === 'rejected')
      if (failed?.status === 'rejected') throw failed.reason
      return cues.filter((cue): cue is SubtitleCue => cue !== undefined)
    } catch {
      signal?.throwIfAborted()
      return null
    }
  }
}

/** 显式零时长 ASS/SSA 事件即使有文本也没有显示区间，不应导致整条字幕轨失败。 */
function skipZeroDurationEvent(codec: string, text: string, duration: number, explicit: boolean) {
  if (duration > 0) return false
  if (explicit && duration === 0 && supportedCodecs.has(codec) && codec !== 'S_TEXT/UTF8') {
    const fields = text.split(',')
    // 仍校验事件结构；缺失时长不等同于显式零时长，也不猜测显示时间。
    if (fields.length >= 9 && /^\d+$/.test(fields[0])) return true
  }
  throw fail('block_invalid', '字幕块缺少有效时长')
}

async function skipElement(reader: Reader, element: Element) {
  if (!element.unknown) return element.end
  if (element.id !== 0x1F43B675) throw fail('container_invalid', '不支持的未知长度元素')
  for (let offset = element.start; offset < element.end;) {
    const field = await reader.element(offset, element.end)
    if (segmentIds.has(field.id)) return offset
    if (field.unknown) throw fail('container_invalid', 'Cluster 内部元素长度未知')
    offset = field.end
  }
  return element.end
}

/**
 * 从 SeekHead 找 Cues 的绝对位置。没有 Cues 条目时返回 null；
 * 但如果它引用了另一个 SeekHead（mkvmerge 可能把部分条目放在文件末尾），无法确定，返回 undefined。
 */
async function readSeekCues(reader: Reader, seekHead: Element, segmentStart: number) {
  let chained = false
  for await (const seek of reader.children(seekHead)) {
    if (seek.id !== 0x4DBB) continue
    let id = 0
    let position = -1
    for await (const field of reader.children(seek)) {
      if (field.id === 0x53AB) id = Number(await reader.uint(field))
      if (field.id === 0x53AC) position = Number(await reader.uint(field))
    }
    if (id === 0x1C53BB6B && position >= 0) return segmentStart + position
    if (id === 0x114D9B74) chained = true
  }
  return chained ? undefined : null
}

/** 视频轨：轨道号与 Colour → TransferCharacteristics（16 = PQ，18 = HLG）；不是视频轨返回 undefined */
async function readVideoTrack(reader: Reader, entry: Element) {
  let type = 0
  let number = 0
  let transfer: VideoTransfer | undefined
  for await (const field of reader.children(entry)) {
    if (field.id === 0x83) type = Number(await reader.uint(field))
    if (field.id === 0xD7) number = Number(await reader.uint(field))
    if (field.id !== 0xE0) continue
    for await (const item of reader.children(field)) {
      if (item.id !== 0x55B0) continue
      for await (const colour of reader.children(item)) {
        if (colour.id !== 0x55BA) continue
        const value = Number(await reader.uint(colour))
        transfer = value === 16 ? 'pq' : value === 18 ? 'hlg' : 'sdr'
      }
    }
  }
  if (type !== 1 || !Number.isSafeInteger(number) || number <= 0) return undefined
  return { number, transfer }
}

type ContentEncodingResult =
  | { kind: 'none' }
  | { kind: 'compressed'; compression: ContentCompression }
  | { kind: 'unsupported'; code: UnsupportedSubtitleCode; reason: string }

/** 解析 ContentEncodings；字段缺省值按 Matroska 规范（Scope=1、Type=0、Algo=0 zlib） */
async function readContentEncodings(reader: Reader, element: Element): Promise<ContentEncodingResult> {
  const encodings: Element[] = []
  for await (const child of reader.children(element)) if (child.id === 0x6240) encodings.push(child)
  if (!encodings.length) return { kind: 'none' }
  if (encodings.length > 1)
    return { kind: 'unsupported', code: 'multi_encoding', reason: '暂不支持多层内容编码的字幕轨' }
  let scope = 1
  let type = 0
  let encrypted = false
  let algo = 0
  let settings: Uint8Array = new Uint8Array()
  for await (const field of reader.children(encodings[0])) {
    if (field.id === 0x5032) scope = Number(await reader.uint(field))
    if (field.id === 0x5033) type = Number(await reader.uint(field))
    if (field.id === 0x5035) encrypted = true
    if (field.id === 0x5034) {
      for await (const item of reader.children(field)) {
        if (item.id === 0x4254) algo = Number(await reader.uint(item))
        // 复制一份，Reader 的读取窗口会被后续读取替换
        if (item.id === 0x4255) settings = (await reader.value(item)).slice()
      }
    }
  }
  if (encrypted || type !== 0)
    return { kind: 'unsupported', code: 'encrypted', reason: '暂不支持加密字幕轨' }
  if (algo !== 0 && algo !== 3)
    return { kind: 'unsupported', code: 'compression_algo', reason: '暂不支持此字幕压缩算法' }
  return { kind: 'compressed', compression: { algo, scope, settings } }
}

async function readTrack(reader: Reader, entry: Element) {
  const track: EmbeddedSubtitleTrack = {
    number: 0,
    uid: '',
    codec: '',
    kind: 'text',
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
  let encoding: ContentEncodingResult = { kind: 'none' }
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
        encoding = await readContentEncodings(reader, field)
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
  if (!Number.isSafeInteger(track.number) || track.number <= 0) throw fail('container_invalid', '无效字幕轨编号')
  track.language = languageIetf || track.language
  if (bitmapCodecs.has(track.codec)) track.kind = 'bitmap'
  // 先判 codec，图片字幕即使同时压缩也提示「图片字幕」，原因更准确。
  const unsupported: { code: UnsupportedSubtitleCode; reason: string } | undefined =
    unsupportedImageCodecs.has(track.codec)
      ? { code: 'bitmap_codec', reason: '暂不支持此图片字幕' }
      : !supportedCodecs.has(track.codec) && !bitmapCodecs.has(track.codec)
        ? { code: 'codec', reason: '暂不支持此字幕编码' }
        : encoding.kind === 'unsupported'
        ? encoding
        : scaled
          ? { code: 'time_scale', reason: '暂不支持独立字幕时间缩放' }
          : undefined
  track.supported = !unsupported
  if (unsupported) {
    track.unsupportedReason = unsupported.reason
    track.unsupportedCode = unsupported.code
  }
  const compression = encoding.kind === 'compressed' ? encoding.compression : undefined
  // 只有文本字幕才解读 CodecPrivate，避免把图片私有数据当 UTF-8；Scope 含 2 时先解压。
  if (track.supported && track.kind === 'text') {
    for await (const field of reader.children(entry))
      if (field.id === 0x63A2) track.header = await reader.encodedText(field, compression, 2)
  }
  return { track, compression }
}

/** Matroska ASS 数据不含起止时间；按容器时间还原，文本中的逗号原样保留。 */
export function assDialogue(cue: SubtitleCue, codec: string) {
  const fields = cue.text.split(',')
  if (fields.length < 9) throw fail('event_invalid', 'ASS 字幕事件字段不足')
  const [order, layer, ...rest] = fields
  if (!/^\d+$/.test(order)) throw fail('event_invalid', 'ASS ReadOrder 无效')
  const first = codec.endsWith('SSA') ? 'Marked=0' : layer || '0'
  return {
    order: Number(order),
    line: `Dialogue: ${first},${assTime(cue.start)},${assTime(cue.end)},${rest.join(',')}`,
  }
}

function assTime(seconds: number) {
  if (!Number.isFinite(seconds)) throw fail('event_invalid', '字幕时间无效')
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
