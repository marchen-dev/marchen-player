/**
 * 弹幕列表的数据派生。
 *
 * 状态机里的 mergedComments 已经把各来源打平，不再携带来源信息；这里按来源逐个调用
 * mergeSources，再交给与渲染器相同的转换函数，保证列表中的时间（含链接弹幕偏移、
 * 零秒之前隐藏）、文本和颜色与屏幕上实际出现的弹幕一致，同时不改动共享合并逻辑。
 */
import type { DanmakuItem } from '@marchen/danmaku-engine'
import type { DanmakuEntry } from '@marchen/shared/danmaku'
import { convertDandanplayComments } from '@marchen/danmaku-engine'
import { mergeSources } from '@marchen/shared/danmaku'
import { danmakuSourceName } from '@renderer/lib/danmaku'

import { toSimplified } from './traditional-to-simplified'

export interface DanmakuListSource {
  id: string
  name: string
  /** 实际参与显示的条数，已排除偏移后落在零秒之前和内容为空的弹幕 */
  count: number
}

export interface DanmakuListRow extends Pick<DanmakuItem, 'time' | 'text' | 'mode' | 'color'> {
  /** 不同来源的 cid 可能重复，key 需带上来源标识 */
  key: string
  sourceId: string
  sourceName: string
}

export interface DanmakuList {
  rows: DanmakuListRow[]
  sources: DanmakuListSource[]
}

export function buildDanmakuList(
  entries: readonly DanmakuEntry[] | undefined,
  options: { simplified: boolean },
): DanmakuList {
  const sources: DanmakuListSource[] = []
  const rows: DanmakuListRow[] = []

  for (const entry of entries ?? []) {
    if (!entry.selected) continue
    const items = convertDandanplayComments(mergeSources([entry]))
    const sourceName = danmakuSourceName(entry)
    sources.push({ id: entry.source, name: sourceName, count: items.length })
    for (const item of items) {
      rows.push({
        key: `${entry.source}:${item.id}`,
        time: item.time,
        text: options.simplified ? toSimplified(item.text) : item.text,
        mode: item.mode,
        color: item.color,
        sourceId: entry.source,
        sourceName,
      })
    }
  }

  // Array.prototype.sort 是稳定排序，同一时间点保持来源内的原有顺序
  rows.sort((left, right) => left.time - right.time)
  return { rows, sources }
}

export function filterDanmakuList(
  rows: readonly DanmakuListRow[],
  filter: { keyword?: string; sourceId?: string },
): DanmakuListRow[] {
  const keyword = filter.keyword?.trim().toLowerCase()
  if (!keyword && !filter.sourceId) return rows as DanmakuListRow[]
  return rows.filter(
    (row) =>
      (!filter.sourceId || row.sourceId === filter.sourceId) &&
      (!keyword || row.text.toLowerCase().includes(keyword)),
  )
}

/** 返回时间不晚于当前播放位置的最后一行下标；尚未出现任何弹幕时返回 -1 */
export function findCurrentRowIndex(rows: readonly DanmakuListRow[], time: number): number {
  let low = 0
  let high = rows.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (rows[middle].time <= time) low = middle + 1
    else high = middle
  }
  return low - 1
}
