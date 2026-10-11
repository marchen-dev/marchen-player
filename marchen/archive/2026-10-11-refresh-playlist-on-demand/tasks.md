## 背景

播放列表只在视频进入 ready、`source` 变化时读取一次；同一集播放期间目录新增的剧集（追更下载完成）不会出现，播到最新一集时因为当时没有下一集，自动连播根本不订阅 ended，新集下好了也不会续播。

方案：在 `usePlaybackSessionObservers` 暴露带过期守卫的 `refreshPlaylist()`，打开播放列表标签时调用一次；自动连播改为只要开关开启就订阅 ended，结束时重新读取列表、基于最新列表求下一集再播放，读取期间用户换集、拖动进度或状态已离开 ended 则放弃。Web 列表来自用户选择的文件，重新读取结果不变，无需特殊处理。不引入目录监听。

## 1. 刷新能力

- [x] 1.1 `use-playback-session-observers.ts` 抽出 `refreshPlaylist()`，复用 source 切换时的过期守卫并返回最新列表
- [x] 1.2 经 NativePlayer → PlayerControls → PlayerSettingsPanel → PlayList 传递刷新回调，列表挂载时调用一次

## 2. 结束时刷新再连播

- [x] 2.1 `subscribeAutomaticNext` 改为接收异步解析下一集的函数，首次进入 ended 后解析，返回时仍处于 ended 且订阅未取消才播放
- [x] 2.2 hook 中自动连播不再依赖已知的 `next`，结束时刷新列表并用 `resolvePlaylistNeighbors` 求下一集
- [x] 2.3 更新 `history.test.ts` 自动下一集测试，覆盖结束后刷新出新集、刷新期间离开 ended 不播放、无下一集不播放

## 3. 验证

- [x] 3.1 运行 `pnpm test:player-runtime`、`pnpm typecheck`、`pnpm lint`
