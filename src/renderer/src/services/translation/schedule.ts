/**
 * 弹幕翻译的调度：决定哪些弹幕要翻、按什么顺序翻。
 *
 * 做法是全量后台翻译：把当前视频里需要翻译的文本去重后逐批交给引擎，
 * 每一批都从「当前播放位置之后最近」的未翻译文本取起，翻到片尾再回头补前面的。
 * 因为每批都按当时的播放位置取，用户跳转后不需要任何额外处理就会优先翻新位置。
 * 引擎吞吐是弹幕出场速度的 20 倍以上，正常情况下译文一直领先于播放进度。
 *
 * 这里不依赖 React 与 DOM，便于单测。
 */
import type { TranslationStore } from './translation-store'
import { toSimplified } from '@renderer/services/player-runtime/danmaku/traditional-to-simplified'

const HAN = /\p{Script=Han}/u
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u

/**
 * 是否需要翻译：含汉字，且不含假名。
 * 纯数字、纯拉丁字母、表情不含汉字；日文弹幕通常带假名，送进中文模型只会得到乱码。
 */
export const needsTranslation = (text: string): boolean => HAN.test(text) && !KANA.test(text)

/**
 * 译文表的键：统一转简体并去掉首尾空白。
 * 模型只认简体；与屏蔽规则「匹配前统一转简体」一致，和「繁体转简体」显示开关无关。
 */
export const translationKey = (text: string): string => toSimplified(text).trim()

export interface TranslatableItem {
  id: string
  time: number
  text: string
}

export interface TranslationPlanEntry {
  key: string
  /** 该文本在本集中首次出现的时间 */
  time: number
  /** 本集中使用这段文本的弹幕条数 */
  count: number
}

export interface TranslationPlan {
  /** 去重后的待翻译文本，按首次出现时间升序 */
  entries: TranslationPlanEntry[]
  /** 需要翻译的弹幕条数（未屏蔽、含中文），用于进度展示 */
  itemCount: number
}

/** 从弹幕条目得出翻译计划：过滤被屏蔽与不需要翻译的条目，按文本去重 */
export function buildTranslationPlan(
  items: readonly TranslatableItem[],
  blockedIds: ReadonlySet<string>,
): TranslationPlan {
  const byKey = new Map<string, TranslationPlanEntry>()
  let itemCount = 0
  for (const item of items) {
    if (blockedIds.has(item.id) || !needsTranslation(item.text)) continue
    const key = translationKey(item.text)
    if (!key) continue
    itemCount += 1
    const entry = byKey.get(key)
    if (entry) {
      entry.count += 1
      entry.time = Math.min(entry.time, item.time)
    } else {
      byKey.set(key, { key, time: item.time, count: 1 })
    }
  }
  const entries = [...byKey.values()].sort((left, right) => left.time - right.time)
  return { entries, itemCount }
}

/**
 * 取下一批要翻译的文本：从播放位置之后最近的未完成条目开始，
 * 到片尾还不够就回到片头继续取。
 */
export function pickNextBatch(
  entries: readonly TranslationPlanEntry[],
  isDone: (key: string) => boolean,
  now: number,
  size: number,
): TranslationPlanEntry[] {
  // 二分找到首次出现时间不早于播放位置的第一项
  let low = 0
  let high = entries.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (entries[middle].time < now) low = middle + 1
    else high = middle
  }
  const batch: TranslationPlanEntry[] = []
  for (let offset = 0; offset < entries.length && batch.length < size; offset += 1) {
    const entry = entries[(low + offset) % entries.length]
    if (!isDone(entry.key)) batch.push(entry)
  }
  return batch
}

export interface TranslationProgress {
  /** 已有译文（或已判定翻译失败）的弹幕条数 */
  done: number
  /** 需要翻译的弹幕条数 */
  total: number
}

export interface TranslationRunSummary {
  /** 本集需要翻译的弹幕条数 */
  items: number
  /** 去重后的文本数 */
  uniqueTexts: number
  /** 本次实际送入引擎的文本数（其余来自已有译文） */
  translatedTexts: number
  /** 从开始到全部完成的耗时 */
  durationMs: number
}

export interface TranslationSchedulerOptions {
  translate: (texts: string[]) => Promise<string[]>
  store: TranslationStore
  /** 当前播放位置（秒） */
  now: () => number
  onProgress?: (progress: TranslationProgress) => void
  /** 一集的待翻译文本全部处理完时调用；之后弹幕变化产生新的待翻译文本会再次触发 */
  onComplete?: (summary: TranslationRunSummary) => void
  /** 引擎出错：调度器已自行停止，由调用方决定如何提示与上报 */
  onError?: (error: unknown) => void
  /** 每批文本数。Worker 内部逐条翻译，批小是为了让播放位置变化及时生效 */
  batchSize?: number
  /** 批与批之间主动让出的毫秒数；0 表示不限速。用于降低与视频解码争抢 CPU */
  yieldMs?: number
  clock?: () => number
}

/** 驱动「取一批 → 翻译 → 写入译文表」的循环 */
export class TranslationScheduler {
  private plan: TranslationPlan = { entries: [], itemCount: 0 }
  /** 本计划内已处理的文本：有译文，或引擎返回空结果（按失败处理，显示原文） */
  private readonly settled = new Set<string>()
  private doneItems = 0
  private running = false
  private stopped = true
  /** 每次重建计划或启停都会变化，在途批次据此判断自己是否已过期 */
  private generation = 0
  private startedAt = 0
  private translatedTexts = 0
  private completed = false

  constructor(private readonly options: TranslationSchedulerOptions) {}

  /** 更新弹幕条目与屏蔽集合；已有译文的文本直接计为完成 */
  setItems(items: readonly TranslatableItem[], blockedIds: ReadonlySet<string>): void {
    this.generation += 1
    this.plan = buildTranslationPlan(items, blockedIds)
    this.settled.clear()
    this.doneItems = 0
    for (const entry of this.plan.entries) {
      if (this.options.store.get(entry.key) === undefined) continue
      this.settled.add(entry.key)
      this.doneItems += entry.count
    }
    this.completed = false
    this.translatedTexts = 0
    this.startedAt = this.clock()
    this.reportProgress()
    if (!this.stopped) this.pump()
  }

  start(): void {
    if (!this.stopped) return
    this.stopped = false
    this.startedAt = this.clock()
    this.pump()
  }

  /** 停止后在途批次的结果仍会写入译文表（译文本身有效），但不再继续取下一批 */
  stop(): void {
    this.stopped = true
    this.generation += 1
  }

  get progress(): TranslationProgress {
    return { done: this.doneItems, total: this.plan.itemCount }
  }

  private pump(): void {
    if (this.running || this.stopped) return
    this.running = true
    void this.run().finally(() => {
      this.running = false
      // 运行期间计划被替换或被重新启动：接着处理新的待翻译文本
      if (!this.stopped && this.hasPending()) this.pump()
    })
  }

  private async run(): Promise<void> {
    const { translate, store, now, batchSize = 8, yieldMs = 0 } = this.options
    while (!this.stopped) {
      const generation = this.generation
      const batch = pickNextBatch(
        this.plan.entries,
        (key) => this.settled.has(key),
        now(),
        batchSize,
      )
      if (batch.length === 0) {
        this.finish()
        return
      }
      let translated: string[]
      try {
        translated = await translate(batch.map((entry) => entry.key))
      } catch (error) {
        // 被主动停止时在途请求会以「已关闭」结束，不算引擎故障
        if (this.stopped) return
        this.stopped = true
        this.options.onError?.(error)
        return
      }
      store.setMany(batch.map((entry, index) => [entry.key, translated[index] ?? ''] as const))
      // 计划已被替换：译文已入表，进度由新计划重新统计
      if (generation !== this.generation) continue
      for (const entry of batch) {
        if (this.settled.has(entry.key)) continue
        this.settled.add(entry.key)
        this.doneItems += entry.count
      }
      this.translatedTexts += batch.length
      this.reportProgress()
      if (yieldMs > 0) await new Promise((resolve) => setTimeout(resolve, yieldMs))
    }
  }

  private finish(): void {
    if (this.completed) return
    this.completed = true
    this.reportProgress()
    // 没有任何需要翻译的弹幕时不算一次「完成」
    if (this.plan.itemCount === 0) return
    this.options.onComplete?.({
      items: this.plan.itemCount,
      uniqueTexts: this.plan.entries.length,
      translatedTexts: this.translatedTexts,
      durationMs: this.clock() - this.startedAt,
    })
  }

  private hasPending(): boolean {
    return this.plan.entries.some((entry) => !this.settled.has(entry.key))
  }

  private reportProgress(): void {
    this.options.onProgress?.(this.progress)
  }

  private clock(): number {
    return (this.options.clock ?? (() => performance.now()))()
  }
}
