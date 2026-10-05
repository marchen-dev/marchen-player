## 动机

未匹配弹幕、直接播放的视频会写入 `history` 表（`animeId` 为 0），进度和缩略图都保存着，但影视库只按 `library` 表渲染，应用里没有任何界面能回到这些视频。冷门番、剧场版、非动漫视频和离线打开的文件都落在这个盲区里。

五月的 `add-library` 用影视库替代了原播放记录页，理由是"无法按作品管理"。这个理由没有否定按文件的流水视图，只是当时认为影视库能完全覆盖；未匹配视频正是没覆盖到的部分。

入口位置经过讨论确定：不新增侧边栏项，不把文件塞进影视库按作品组织的"继续观看"。完整列表放进弹窗，播放器空态只放一个按钮。

八月的 `redesign-player-home` 曾三轮尝试在首页展示历史并最终撤回。本次实现时先试过在空态底部放一行最近播放缩略图，实物观感不佳，同样撤回；最终首页不直接渲染任何历史内容，只在现有"通过 URL 播放"按钮旁增加一个同级按钮。

## 变更内容

- 播放器空态新增"播放记录"按钮，与"通过 URL 播放"并排；没有记录时不显示。
- 新增"播放记录"弹窗：列出最近播放的文件（匹配与未匹配都包含），按最近播放时间倒序，显示缩略图、标题和进度。
- 弹窗只有一个入口：播放器空态的"播放记录"按钮。影视库标题栏入口实现后经实物确认不需要，已移除。
- 记录支持点击续播，右键"在 Finder 中显示"和"删除记录"。
- 删除记录时同步清除影视库对应剧集的文件关联，并在确认框中说明会一并清除本地导入的弹幕、字幕与音轨偏好。
- 续播埋点新增播放记录来源，区别于影视库。
- 仅 Electron；Web 不显示任何播放记录入口。

明确不做：

- 不新增侧边栏项，不新增路由。
- 不在播放器首页直接展示缩略图、最近播放列表等历史内容。
- 不修改数据库 schema，不修改 `packages/player-loading` 加载管线；未匹配视频再次打开仍会走在线匹配，匹配不到时再次弹出选择框。
- 不把未匹配视频放进影视库的继续观看、Hero 或所有作品。
- 不提前检查文件是否仍然存在；失效时沿用现有的点击后提示。

## 能力

### 新增能力

- `playback-history-dialog`：播放记录弹窗的内容、排序、续播、在文件管理器中显示、删除及其连带清理。
- `player-home-history-entry`：播放器空态上"播放记录"按钮的显示条件与行为。替代 `redesign-player-home` 中的 `player-home-resume`（该规格要求首页不出现任何历史相关入口）；首页仍不直接渲染历史内容。

### 修改能力

- 无。影视库页面与行为保持不变。

## 影响范围

- `src/renderer/src/page/player/index.tsx`：空态分支增加"播放记录"按钮。
- `src/renderer/src/components/modules/history/`（新增）：播放记录弹窗、记录卡片与右键菜单。
- `src/renderer/src/components/ui/menu/ContextMenu.tsx`：右键菜单层级提升到浮层级，使其能显示在弹窗之上。
- `src/renderer/src/services/history/`（新增）、`src/renderer/src/database/lib/`：播放记录的视图模型与删除（含影视库关联清理）。
- `src/renderer/src/services/player-loading/load-history.ts`：续播来源由固定值改为可传入。
- `src/renderer/src/services/telemetry/contracts.ts`：`video_import_started.source` 新增取值；`docs/observability-runbook.md` 同步口径。
- 不新增依赖、IPC、数据库迁移；不涉及主进程与 Web 构建产物。
