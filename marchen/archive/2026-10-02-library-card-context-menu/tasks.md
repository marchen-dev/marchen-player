## 背景

影视库「继续观看」横向卡与「所有作品」海报卡目前只有单击行为。为两类卡片新增统一的右键菜单（仅 Electron 下影视库可见），提供：播放下一集、查看详情、标记全部已看 / 重置观看进度、在 Finder / 资源管理器中显示、从影视库移除。

方案要点：
- 复用 `components/ui/menu/ContextMenu`（Radix），抽出 `LibraryCardContextMenu` 包裹两类卡片，动作回调由 `page/library/index.tsx` 统一提供。
- 「标记全部已看」把所有正片 episodeId 写入 `watchedEpisodeIds`；「重置观看进度」清空 `watchedEpisodeIds` 与 `lastWatchedEpisodeId`，单集 history 进度不动。两者按 `isCompleted` 二选一显示。
- 「从影视库移除」经 `useConfirmationDialog` 二次确认，只删 library 条目、保留 history；之后再播放会经 `markEpisodeStarted` 自动回到影视库（软删除语义）。
- 「在 Finder 中显示」优先取 lastWatched 集、否则首个已导入集的 history `electron-file` 路径；新增 `app.showItemInFolder` IPC，由主进程校验绝对路径、文件存在且为视频后调用 `shell.showItemInFolder`。无可用路径时菜单项置灰。
- 埋点沿用 `captureFeatureUsed('library', 'context_*')`，失败经 `reportOperationalError` 上报。Hero 不在范围内。

## 1. 数据与 IPC

- [x] 1.1 `library-writer.ts` 新增 `markAllEpisodesWatched`、`resetLibraryProgress`、`removeLibraryEntry`
- [x] 1.2 主进程 `app` 组新增 `showItemInFolder` IPC：校验路径后调用 `shell.showItemInFolder`，失败抛错

## 2. 右键菜单组件

- [x] 2.1 新增 `page/library/LibraryCardContextMenu.tsx`：菜单项、禁用态、平台文案（Finder / 资源管理器）
- [x] 2.2 `LandscapeCard` 与 `PosterCard` 接入右键菜单，样式与影视库配色协调

## 3. 页面接线

- [x] 3.1 `page/library/index.tsx` 实现各动作回调：播放、详情、进度切换、定位文件（查 history 路径）、确认后移除（若详情正打开同一作品则关闭）
- [x] 3.2 埋点与错误上报；运行 typecheck 与 lint
