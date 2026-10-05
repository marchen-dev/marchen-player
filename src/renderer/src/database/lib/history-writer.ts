import { detachFileFromEpisodes } from '@renderer/services/history/records'

import { db } from '../db'

/**
 * 删除一条播放记录，并解除影视库中对应剧集与该文件的关联。
 *
 * 影视库的每一集通过 fileHash 指向 history；只删 history 会让该集仍显示为已导入，
 * 点击却提示「播放记录已失效」。两张表放在同一个事务里，避免只完成一半。
 * 作品条目、已看状态与 lastWatched 指针保持不变。
 */
export async function deleteHistoryRecord(hash: string): Promise<void> {
  await db.transaction('rw', db.history, db.library, async () => {
    const record = await db.history.get(hash)
    if (!record) return

    if (record.animeId) {
      const entry = await db.library.get(record.animeId)
      const episodes = entry && detachFileFromEpisodes(entry.episodes, hash)
      if (episodes) await db.library.update(record.animeId, { episodes })
    }

    await db.history.delete(hash)
  })
}
