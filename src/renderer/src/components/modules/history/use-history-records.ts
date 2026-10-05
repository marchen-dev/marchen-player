import type { HistoryRecordView } from '@renderer/services/history/records'
import { db } from '@renderer/database/db'
import { toHistoryRecordView } from '@renderer/services/history/records'
import { useLiveQuery } from 'dexie-react-hooks'

/**
 * 按最近播放时间倒序读取播放记录。
 *
 * 走 updatedAt 索引只取前 limit 条，并在查询内部立即映射成视图模型：
 * history 记录带着完整弹幕，不能把原始记录留在 React 状态里。
 * 查询尚未返回时结果为 undefined，调用方据此区分「加载中」与「没有记录」。
 */
export function useHistoryRecords(limit: number): HistoryRecordView[] | undefined {
  return useLiveQuery(async () => {
    const records = await db.history.orderBy('updatedAt').reverse().limit(limit).toArray()
    return records.map(toHistoryRecordView)
  }, [limit])
}

/** 跨挂载保留最近一次结果：播放器空态每次进入都会重新挂载，避免入口按钮先消失一帧再出现 */
let hasRecordsCache = false

/**
 * 是否存在任何播放记录，用于决定是否显示播放记录入口。
 * 只读主键计数，不加载记录内容。
 */
export function useHasHistoryRecords(): boolean {
  return (
    useLiveQuery(
      async () => (hasRecordsCache = (await db.history.count()) > 0),
      [],
      hasRecordsCache,
    ) ?? false
  )
}
