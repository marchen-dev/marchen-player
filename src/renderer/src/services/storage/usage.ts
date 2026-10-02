import type { HistoryUsage } from './measure'
import { db } from '@renderer/database/db'

import { accumulateHistoryUsage, emptyHistoryUsage } from './measure'

/**
 * 流式遍历 history 统计可清除的弹幕与缩略图占用。
 * 用 each 而非 toArray，避免把全部弹幕一次性装进数组。
 */
export async function estimateHistoryUsage(): Promise<HistoryUsage> {
  const usage = emptyHistoryUsage()
  await db.history.each((record) => accumulateHistoryUsage(usage, record))
  return usage
}
