import { db } from '@renderer/database/db'
import { danmakuTranslation } from '@renderer/services/translation/service'

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

/**
 * 清除弹幕翻译的引擎与模型。同时会关闭弹幕翻译开关并终止翻译引擎：
 * 开关若保持开启，下次播放会自动重新下载，等于清不掉。
 */
export async function clearTranslationAssets(): Promise<void> {
  await danmakuTranslation.clearAssets()
}

/** 弹幕翻译资源占用的字节数 */
export async function estimateTranslationAssetsUsage(): Promise<number> {
  return danmakuTranslation.usage()
}

/** 清除播放缩略图；进度、弹幕、字幕与海报 cover 不受影响，再次播放会重新生成 */
export async function clearThumbnails(): Promise<void> {
  await db.history.toCollection().modify((record) => {
    if (record.thumbnail) delete record.thumbnail
  })
}
