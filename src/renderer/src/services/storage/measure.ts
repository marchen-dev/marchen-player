import type { DanmakuEntry } from '@marchen/shared/danmaku'
import type { DB_History } from '@renderer/database/schemas/history'

/**
 * 本地数据占用的纯计算部分，不依赖 IndexedDB，便于单元测试。
 *
 * 口径说明：IndexedDB 没有按字段的占用 API，这里用字符串长度估算字节数，
 * 只用于回答「清除能释放多少」，UI 统一以「约」展示。
 */

/** 单个可清除分项的统计：估算字节与条目数 */
export interface UsageItem {
  bytes: number
  count: number
}

/** 遍历 history 得到的分项统计 */
export interface HistoryUsage {
  /** 仅 auto 弹幕（可重新获取）；count 为含 auto 弹幕的集数 */
  danmaku: UsageItem
  /** 关键帧缩略图；count 为含缩略图的记录数 */
  thumbnail: UsageItem
}

export const emptyHistoryUsage = (): HistoryUsage => ({
  danmaku: { bytes: 0, count: 0 },
  thumbnail: { bytes: 0, count: 0 },
})

/** 弹幕缓存只认 auto：local 为用户导入内容、link 为外链抓取，均视为用户数据 */
export const isClearableDanmaku = (entry: DanmakuEntry) => entry.type === 'auto'

/** 把单条 history 计入统计（原地累加，避免遍历大库时产生中间对象） */
export function accumulateHistoryUsage(usage: HistoryUsage, record: DB_History): void {
  const auto = record.danmaku?.filter(isClearableDanmaku) ?? []
  if (auto.length > 0) {
    usage.danmaku.count += 1
    for (const entry of auto) usage.danmaku.bytes += JSON.stringify(entry).length
  }
  if (record.thumbnail) {
    usage.thumbnail.count += 1
    usage.thumbnail.bytes += record.thumbnail.length
  }
}

/**
 * 去掉 auto 弹幕后的结果；没有 auto 时返回 null 表示无需改写，
 * 全部被移除时返回 undefined，与「无缓存」语义一致。
 */
export function stripAutoDanmaku(
  danmaku: DanmakuEntry[] | undefined,
): DanmakuEntry[] | undefined | null {
  if (!danmaku?.some(isClearableDanmaku)) return null
  const rest = danmaku.filter((entry) => !isClearableDanmaku(entry))
  return rest.length > 0 ? rest : undefined
}
