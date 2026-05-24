## 背景

当前 library 只在「单集观看 ≥ 90%」时由 `markEpisodeWatched` 写入 `watchedEpisodeIds` 和 `lastWatchedEpisodeId`。看了几分钟弃番 / 没看到 90% 的场景下：

- `lastWatchedEpisodeId` 一直为空 → Hero CTA / pickNextEpisode 找不到指针
- `lastWatchedAt` 在 `addNewBangumi` 创建分支才写一次；`updateLibraryOnReplay`（重播）完全不刷新 → 旧番重看不会冒泡

把「上次播放的指针」从「看完才写」改成「开始播放就写」：

- 在 `upsertLibraryEntry` 两个分支（创建、更新）以及 `updateLibraryOnReplay` 中，都写入 `lastWatchedEpisodeId = episodeId` 和 `lastWatchedAt = now`
- 不动 `watchedEpisodeIds` 与 90% 阈值的语义
- 同步把 `isWatching` 改为「`watchedEpisodeIds.length > 0` 或 `lastWatchedEpisodeId` 存在」，让看了一会儿的作品也出现在「继续观看」Rail

## 1. 写入侧

- [x] 1.1 `library-writer.ts` 的 `upsertLibraryEntry`：创建分支的 `entry` 字面量加 `lastWatchedEpisodeId: episodeId`
- [x] 1.2 `library-writer.ts` 的 `upsertLibraryEntry`：更新分支的 `db.library.update(...)` 加 `lastWatchedEpisodeId: episodeId`、`lastWatchedAt: new Date().toISOString()`
- [x] 1.3 `history-store.ts` 的 `updateLibraryOnReplay`：`db.library.update(...)` 加 `lastWatchedEpisodeId: episodeId`、`lastWatchedAt: new Date().toISOString()`

## 2. 读取侧

- [x] 2.1 `selectors.ts` 的 `isWatching`：放宽为 `watchedEpisodeIds.length > 0 || !!item.lastWatchedEpisodeId`，同时保持「未完结」的判断不变
