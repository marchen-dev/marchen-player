import { db } from '@renderer/database/db'

import { stripAutoDanmaku } from './measure'

/**
 * 清除弹幕缓存：只删可重新获取的 auto 弹幕，保留本地导入与外链弹幕。
 * 加载流程在缓存缺少 auto 时会重新拉取并与非 auto 条目合并，因此无需通知播放器。
 * 单个 rw 事务内批量改写，替代逐条 update。
 */
export async function clearAutoDanmakuCache(): Promise<void> {
  await db.history.toCollection().modify((record) => {
    const next = stripAutoDanmaku(record.danmaku)
    if (next === null) return
    if (next) record.danmaku = next
    else delete record.danmaku
  })
}

/** 清除播放缩略图；进度、弹幕、字幕与海报 cover 不受影响，再次播放会重新生成 */
export async function clearThumbnails(): Promise<void> {
  await db.history.toCollection().modify((record) => {
    if (record.thumbnail) delete record.thumbnail
  })
}
