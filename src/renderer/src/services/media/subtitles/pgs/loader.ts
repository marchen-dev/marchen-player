import type { CuePosition } from '../matroska'
import type { PgsFrame } from './compose'
import type { PgsSessionErrorCode, PgsSessionStats } from './protocol'
import type { DisplaySet } from './segments'
import type { PgsWindowParams } from './window'
import { SubtitleError } from '@marchen/shared/media'
import { composeDisplaySet, isIndependent } from './compose'
import { PgsError } from './errors'
import { parseDisplaySet } from './segments'
import {
  activeIndex,
  backtrack,
  decodeAheadEnd,
  mergeRanges,
  PGS_WINDOW,
  readAheadEnd,
  uncovered,
} from './window'

/** 加载器需要的块读取能力；生产中由 MatroskaSubtitles 提供，测试可替换 */
export interface PgsBlockSource {
  cueIndex: (trackNumber: number, signal?: AbortSignal) => Promise<CuePosition[] | null>
  readCueBlock: (
    trackNumber: number,
    position: CuePosition,
    signal?: AbortSignal,
  ) => Promise<{ time: number; data: Uint8Array }>
  scanBlocks: (trackNumber: number, from: number, to: number, signal?: AbortSignal) => Promise<CuePosition[]>
}

/** 加载器送出的合成结果；Worker 负责把 RGBA 转成 ImageBitmap */
export interface PgsLoaderFrame {
  key: number
  start: number
  end: number
  frame: PgsFrame
}

export interface PgsLoaderEvents {
  frames: (generation: number, frames: PgsLoaderFrame[], keep: number[], ends: [number, number][]) => void
  error: (code: PgsSessionErrorCode, message: string, fatal: boolean) => void
}

interface Entry {
  key: number
  time: number
  position: CuePosition
  /** 已读取并解析的显示集；被缓存淘汰后为 undefined，需要时重读 */
  set?: DisplaySet
  /** 解压后的大小；读过一次就记住，用于预算规划 */
  size?: number
  /** 是否可以独立显示；读过一次就记住，淘汰后仍可用于回溯 */
  independent?: boolean
  /** 合成后的像素数；未合成时用对象定义估算 */
  pixels?: number
  /** 读取或解析失败；不再重试，回溯时视为不能独立显示 */
  failed?: boolean
}

const keyOf = (position: CuePosition) => position.cluster + position.relative

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

/**
 * PGS 时间窗口加载器（design 第 4、5 节）。
 *
 * 每次 update 只记录目标时间，由单个 pump 循环按“定位 → 回溯 → 前方读取 → 提前合成 → 淘汰”推进；
 * 跳转（generation 变化）会中止在途读取，迟到结果按代次丢弃。所有读取都有并发、字节与像素上限。
 */
export class PgsWindowLoader {
  private entries: Entry[] = []
  private times: number[] = []
  private mode: 'index' | 'scan' = 'index'
  private scanned: [number, number][] = []
  private target = { time: 0, generation: -1, playing: false }
  private controller = new AbortController()
  private running = false
  private pumping: Promise<void> = Promise.resolve()
  private dirty = false
  private closed = false
  /** 当前代次已送出的帧 key 及其结束时间 */
  private sent = new Map<number, number>()
  /** 上次送出的保留集合，避免无变化时重复发消息 */
  private lastKeep = ''
  private cachedBytes = 0
  private consecutiveFailures = 0
  private reportedBacktrack = -1
  private readonly openedAt: number
  private readonly statistics: Omit<PgsSessionStats, 'readBytes' | 'hdr'> = {
    maxBacktrack: 0,
    scanUsed: false,
    blockFailures: 0,
    decodeFailures: 0,
  }

  constructor(
    private readonly blocks: PgsBlockSource,
    private readonly trackNumber: number,
    private readonly options: { hdr: boolean; now?: () => number },
    private readonly events: PgsLoaderEvents,
    private readonly params: PgsWindowParams = PGS_WINDOW,
  ) {
    this.openedAt = this.now()
  }

  /** 读取字幕索引；没有索引时进入扫描模式（借视频索引定位） */
  async start(signal?: AbortSignal): Promise<'index' | 'scan'> {
    const positions = await this.blocks.cueIndex(this.trackNumber, signal)
    if (positions) {
      this.insert(positions)
      this.mode = 'index'
    } else {
      this.mode = 'scan'
      this.statistics.scanUsed = true
    }
    return this.mode
  }

  /** 播放位置变化；generation 变化时丢弃在途工作与已送出的帧 */
  update(time: number, generation: number, playing: boolean) {
    if (this.closed) return
    if (generation !== this.target.generation) {
      this.controller.abort()
      this.controller = new AbortController()
      this.sent.clear()
      this.lastKeep = ''
    }
    this.target = { time, generation, playing }
    this.dirty = true
    if (!this.running) this.pumping = this.pump()
  }

  /** 当前推进循环结束时完成；主要用于测试和关闭前等待 */
  idle(): Promise<void> {
    return this.pumping
  }

  close() {
    this.closed = true
    this.controller.abort()
    this.entries = []
    this.times = []
    this.sent.clear()
  }

  stats(): Omit<PgsSessionStats, 'readBytes' | 'hdr'> {
    return { ...this.statistics }
  }

  private now() {
    return this.options.now?.() ?? performance.now()
  }

  private insert(positions: CuePosition[]) {
    const known = new Set(this.entries.map((entry) => entry.key))
    let changed = false
    for (const position of positions) {
      const key = keyOf(position)
      if (known.has(key)) continue
      known.add(key)
      this.entries.push({ key, time: position.time, position })
      changed = true
    }
    if (!changed) return
    this.entries.sort((a, b) => a.time - b.time || a.key - b.key)
    this.times = this.entries.map((entry) => entry.time)
  }

  private async pump() {
    this.running = true
    try {
      while (this.dirty && !this.closed) {
        this.dirty = false
        const { generation } = this.target
        const signal = this.controller.signal
        try {
          await this.pass(signal)
        } catch (error) {
          if (this.closed || signal.aborted || isAbort(error)) continue
          const code =
            (error as { code?: PgsSessionErrorCode }).code ??
            // 扫描模式下借视频索引定位失败：文件没有可用的索引
            (error instanceof SubtitleError && error.reason === 'container_invalid' ? 'index_missing' : 'read_failed')
          this.events.error(code, error instanceof Error ? error.message : String(error), true)
          this.close()
          return
        }
        // 后台扫描还有剩余工作且目标未变：继续推进
        if (!this.dirty && this.target.generation === generation && this.mode === 'scan' && this.target.playing)
          this.dirty = this.hasScanWork(this.target.time)
      }
    } finally {
      this.running = false
    }
  }

  private async pass(signal: AbortSignal) {
    const { time: t, generation } = this.target
    if (this.mode === 'scan') await this.scanAround(t, signal)
    if (signal.aborted) return

    const index = activeIndex(this.times, t)
    // 当前显示集的 epoch 起点
    let chainStart = -1
    if (index >= 0) {
      const result = await this.resolveChain(index, signal)
      if (signal.aborted) return
      if (result.kind === 'found') {
        chainStart = result.start
        this.statistics.maxBacktrack = Math.max(this.statistics.maxBacktrack, result.steps)
      } else if (
        result.kind === 'exceeded' &&
        this.reportedBacktrack !== index &&
        // 只有碰到数量或字节上限才算超限；回溯到开头仍找不到起点（块读取失败，
        // 或扫描模式下起点尚未扫描到）不在此上报
        result.steps !== index + 1
      ) {
        this.reportedBacktrack = index
        this.events.error('backtrack_exceeded', '字幕依赖链过长，当前位置暂不显示', false)
      }
    }

    const from = Math.max(index, 0)
    // 先保证提前解码窗口（按时间）内的块已读，并发读取，避免逐个串行等待
    const decodeFrom = chainStart >= 0 || index < 0 ? from : index + 1
    const timeEnd = activeIndex(this.times, t + this.params.decodeSeconds) + 1
    await this.loadRange(chainStart >= 0 ? chainStart : decodeFrom, Math.max(timeEnd, decodeFrom + 1), signal)
    if (signal.aborted) return

    // 提前合成：时间与像素双上限；当前显示集无法回溯时跳过它
    const decodeEnd = decodeAheadEnd(this.times, decodeFrom, t, (k) => this.estimatePixels(k), this.params)
    const frames: PgsLoaderFrame[] = []
    for (let k = decodeFrom; k < decodeEnd; k++) {
      const entry = this.entries[k]
      const end = this.endOf(k)
      if (this.sent.has(entry.key)) continue
      const frame = await this.compose(k, signal)
      if (signal.aborted) return
      if (!frame) continue
      frames.push({ key: entry.key, start: entry.time, end, frame })
    }
    if (this.target.generation !== generation || signal.aborted) return

    const keep: number[] = []
    const ends: [number, number][] = []
    for (let k = decodeFrom; k < decodeEnd; k++) {
      const entry = this.entries[k]
      keep.push(entry.key)
      const end = this.endOf(k)
      const previous = this.sent.get(entry.key)
      if (previous !== undefined && previous !== end) ends.push([entry.key, end])
    }
    for (const frame of frames) this.sent.set(frame.key, frame.end)
    for (const [key, end] of ends) this.sent.set(key, end)
    // 不在保留范围的帧由主线程释放；这里同步忘记，以便回到该位置时重新合成
    const kept = new Set(keep)
    for (const key of [...this.sent.keys()]) if (!kept.has(key)) this.sent.delete(key)
    if (
      this.statistics.firstBitmapMs === undefined &&
      frames.some((frame) => frame.frame.rects.length > 0)
    )
      this.statistics.firstBitmapMs = Math.round(this.now() - this.openedAt)
    const keepSignature = keep.join(',')
    if (frames.length || ends.length || keepSignature !== this.lastKeep) {
      this.lastKeep = keepSignature
      this.events.frames(generation, frames, keep, ends)
    }

    // 当前字幕送出后再做前方预读：时间与字节双上限
    const readEnd = readAheadEnd(this.times, from, t, (k) => this.entries[k].size ?? 0, this.params)
    await this.loadRange(from, readEnd, signal)
    if (signal.aborted) return

    this.evict(chainStart >= 0 ? Math.min(chainStart, from) : from, readEnd)
  }

  /** 第 k 个显示集的结束时间：下一个显示集的开始；扫描模式下，下一个尚未扫描到时未知 */
  private endOf(k: number) {
    return this.entries[k + 1]?.time ?? Infinity
  }

  private async resolveChain(index: number, signal: AbortSignal) {
    for (;;) {
      const result = backtrack(
        index,
        (k) => (this.entries[k].failed ? false : this.entries[k].independent),
        (k) => this.entries[k].size ?? 0,
        this.params,
      )
      if (result.kind !== 'need') return result
      await this.load(result.index, signal)
      if (signal.aborted) return result
    }
  }

  private async compose(k: number, signal: AbortSignal): Promise<PgsFrame | undefined> {
    const chain = await this.resolveChain(k, signal)
    if (signal.aborted || chain.kind !== 'found') return undefined
    const sets: DisplaySet[] = []
    for (let i = chain.start; i <= k; i++) {
      const entry = this.entries[i]
      if (entry.failed) continue
      if (!entry.set) await this.load(i, signal)
      if (signal.aborted) return undefined
      if (entry.set) sets.push(entry.set)
    }
    if (!sets.length || !isIndependent(sets[0])) return undefined
    try {
      const frame = composeDisplaySet(sets, { hdr: this.options.hdr })
      this.entries[k].pixels = frame.rects.reduce((sum, rect) => sum + rect.width * rect.height, 0)
      return frame
    } catch (error) {
      if (!(error instanceof PgsError)) throw error
      this.statistics.decodeFailures++
      return undefined
    }
  }

  private estimatePixels(k: number) {
    const entry = this.entries[k]
    if (entry.pixels !== undefined) return entry.pixels
    if (!entry.set) return 0
    return entry.set.objects.reduce((sum, object) => sum + object.width * object.height, 0)
  }

  /** 有界并发读取 [from, to) 中尚未读取的块 */
  private async loadRange(from: number, to: number, signal: AbortSignal) {
    const pending: number[] = []
    for (let k = Math.max(0, from), end = Math.min(to, this.entries.length); k < end; k++) {
      const entry = this.entries[k]
      if (!entry.set && !entry.failed) pending.push(k)
    }
    let next = 0
    await Promise.all(
      Array.from({ length: Math.min(this.params.concurrency, pending.length) }, async () => {
        while (next < pending.length && !signal.aborted) await this.load(pending[next++], signal)
      }),
    )
  }

  private async load(k: number, signal: AbortSignal) {
    const entry = this.entries[k]
    if (entry.set || entry.failed) return
    try {
      const block = await this.blocks.readCueBlock(this.trackNumber, entry.position, signal)
      if (signal.aborted) return
      const set = parseDisplaySet(block.data)
      entry.set = set
      entry.size = block.data.length
      entry.independent = isIndependent(set)
      this.cachedBytes += block.data.length
      this.consecutiveFailures = 0
    } catch (error) {
      if (signal.aborted || isAbort(error)) return
      entry.failed = true
      this.statistics.blockFailures++
      this.consecutiveFailures++
      if (this.consecutiveFailures >= this.params.maxConsecutiveFailures) {
        const code: PgsSessionErrorCode =
          error instanceof PgsError
            ? 'decode_failed'
            : error instanceof SubtitleError && error.reason === 'block_invalid'
              ? 'block_invalid'
              : 'read_failed'
        throw Object.assign(new Error(error instanceof Error ? error.message : String(error)), {
          code,
        })
      }
    }
  }

  /** 已读显示集超出缓存预算时，淘汰离当前窗口最远的；窗口 [keepFrom, keepTo) 内的不淘汰 */
  private evict(keepFrom: number, keepTo: number) {
    if (this.cachedBytes <= this.params.cachedBytes) return
    const candidates = this.entries
      .map((entry, k) => ({ entry, k }))
      .filter(({ entry, k }) => entry.set && (k < keepFrom || k >= keepTo))
      .sort((a, b) => distance(b.k) - distance(a.k))
    function distance(k: number) {
      return k < keepFrom ? keepFrom - k : k - keepTo
    }
    for (const { entry } of candidates) {
      if (this.cachedBytes <= this.params.cachedBytes) break
      this.cachedBytes -= entry.size ?? 0
      entry.set = undefined
    }
  }

  /** 扫描模式：先保证 [t - 10, t + 5] 已扫描，才能判断当前字幕 */
  private async scanAround(t: number, signal: AbortSignal) {
    const from = Math.max(0, t - this.params.scanBehindSeconds)
    await this.scanGaps(from, t + this.params.scanAheadSeconds, signal)
  }

  /** 播放时的后台推进：往后领先到 t + 30，往前补到 t − 30；每次只扫一段 */
  private hasScanWork(t: number) {
    return this.nextScanGap(t) !== undefined
  }

  private nextScanGap(t: number): [number, number] | undefined {
    const ahead = uncovered(this.scanned, t, t + this.params.scanLeadSeconds)[0]
    if (ahead) return ahead
    return uncovered(this.scanned, Math.max(0, t - this.params.scanBackfillSeconds), t).at(-1)
  }

  private async scanGaps(from: number, to: number, signal: AbortSignal) {
    for (const [start, end] of uncovered(this.scanned, from, to)) {
      for (let cursor = start; cursor < end && !signal.aborted; cursor += this.params.scanChunkSeconds) {
        const stop = Math.min(end, cursor + this.params.scanChunkSeconds)
        this.insert(await this.blocks.scanBlocks(this.trackNumber, cursor, stop, signal))
        this.scanned = mergeRanges([...this.scanned, [cursor, stop]])
      }
    }
    // 当前段扫描完，播放时推进下一段后台扫描
    if (this.target.playing && !signal.aborted) {
      const gap = this.nextScanGap(this.target.time)
      if (gap) {
        const stop = Math.min(gap[1], gap[0] + this.params.scanChunkSeconds)
        this.insert(await this.blocks.scanBlocks(this.trackNumber, gap[0], stop, signal))
        this.scanned = mergeRanges([...this.scanned, [gap[0], stop]])
      }
    }
  }
}
