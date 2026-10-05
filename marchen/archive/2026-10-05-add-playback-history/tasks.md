## 1. 数据层

- [x] 1.1 新增 `services/history/records.ts`：定义播放记录视图模型，以及标题、进度比例、是否看完、图片回退、来源类型的纯函数
- [x] 1.2 为 records 编写单元测试，覆盖已匹配、未匹配、缺字段三类记录
- [x] 1.3 新增 `use-history-records.ts`：按 `updatedAt` 倒序读取指定条数并立即映射为视图模型，不保留弹幕等大字段
- [x] 1.4 新增 `database/lib/history-writer.ts` 的 `deleteHistoryRecord`：单事务内清除影视库对应剧集的 `fileHash` 并删除记录
- [x] 1.5 为删除时的影视库关联清理（纯函数 `detachFileFromEpisodes`）编写测试；事务封装依赖 IndexedDB，项目未引入其测试替身，留待实机走查

## 2. 续播来源与埋点

- [x] 2.1 `contracts.ts` 的 `video_import_started.source` 新增 `history`
- [x] 2.2 `loadHistoricalVideo` 增加可选 `importSource` 参数（默认 `library`），并补充对应测试用例
- [x] 2.3 `useLoadingHistoricalAnime` 从 `location.state.source` 读取来源并做白名单校验
- [x] 2.4 `docs/observability-runbook.md` 补充新的来源取值与 `playback_history` feature

## 3. 记录卡片与右键菜单

- [x] 3.1 实现 `HistoryRecordCard`：缩略图（含占位与加载失败回退）、进度线、单行截断标题与进度文案
- [x] 3.2 实现 `HistoryRecordContextMenu`：播放、在文件管理器中显示（仅本地文件）、删除记录（当前已加载视频置灰）
- [x] 3.3 实现共用动作 hook：续播跳转、在文件管理器中显示、带确认的删除，失败经 `reportOperationalError` 上报并 toast，交互经 `captureFeatureUsed` 记录

## 4. 播放记录弹窗

- [x] 4.1 实现 `PlaybackHistoryDialog` 与 `openPlaybackHistoryDialog()`：atom 控制开关，打开时查询最近 200 条，包含空状态
- [x] 4.2 在 `App.tsx` 根部按 `!isWeb` 挂载弹窗
- [x] 4.3 点击记录后关闭弹窗并续播

## 5. 播放器首页入口

- [x] 5.1 空态提示下方新增"播放记录"按钮，与"通过 URL 播放"并排、样式一致，仅 Electron 且有记录时显示
- [x] 5.2 用 `db.history.count()` 判断是否存在记录，并做跨挂载缓存避免按钮闪烁
- [x] 5.3 移除已撤回的首页最近播放行及其专用代码（行组件、卡片的行内样式、`home_recent` 来源）

## 6. 影视库入口

- [x] 6.1 影视库标题栏入口实现后经实物确认不需要，已移除并恢复影视库页面原状

## 7. 验证

- [x] 7.1 运行 `pnpm typecheck`、`pnpm lint`、`pnpm test:player-runtime` 并修复问题
- [x] 7.2 `pnpm dev` 下确认首页按钮与弹窗：浅色与深色主题、有记录与无记录、开启与未开启 URL 播放
- [x] 7.3 实机走查：未匹配视频续播、已匹配视频续播、删除后影视库对应剧集不再可播、文件失效提示、拖入文件覆盖层正常
