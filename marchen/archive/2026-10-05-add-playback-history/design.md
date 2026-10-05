## 背景

- `history` 表以文件 hash 为主键，匹配与未匹配的视频都会写入；未匹配记录的 `animeId` / `episodeId` 为 0，`animeTitle` 为文件名。`updatedAt` 已建索引，加载时和播放中每 2 秒的进度写入都会更新它。
- 缩略图在视频打开后截取片长中点一帧（宽度上限 640，JPEG），与是否匹配无关，因此未匹配记录同样有缩略图。设置里的"清除缩略图"会把它删掉。
- 每条记录内嵌完整弹幕内容，Dexie 无法只读取部分字段。
- 续播已有统一入口 `loadHistoricalVideo`：影视库通过 `navigate(PLAYER, { state: { hash } })` 触发，`useLoadingHistoricalAnime` 消费后调用它，来源埋点固定为 `library`。
- 播放器空态是 `VideoDropZone` 内一个居中的弹性容器；加载中由 `VideoProvider` 整体替换 children，播放中渲染 `NativePlayer`，空态分支都不挂载。
- 影视库每一集通过 `episodes[].fileHash` 关联 `history`；记录不存在时点击该集会提示"播放记录已失效"。
- `redesign-player-home` 的 `player-home-resume` 规格禁止首页展示历史内容，本变更显式替代它。

## 目标与非目标

**目标：**

- 让未匹配视频有可回到的入口，同时覆盖全部最近播放的文件。
- 首页只增加一个按钮，不直接渲染历史内容，居中打开入口的结构、尺寸和交互不变。
- 删除记录不在影视库留下点不开的剧集。
- 不升数据库版本，不改 `packages/*`。

**非目标：**

- 不记住"已跳过匹配"，未匹配视频再次打开仍走在线匹配。
- 不做搜索、筛选、批量删除、分页加载。
- 不提前探测文件是否存在。
- 不支持 Web。

## 决策

### 1. 模块位置与组成

新增 `components/modules/history/`，不放进 `page/library/`：播放记录按文件组织，与按作品组织的影视库是两种模型，卡片和菜单不复用 `DB_Library` 相关组件。

```text
components/modules/history/
├── PlaybackHistoryDialog.tsx   弹窗 + openPlaybackHistoryDialog()
├── HistoryRecordCard.tsx       缩略图 + 进度线 + 标题 + 进度文案
├── HistoryRecordContextMenu.tsx
├── dialog-state.ts             弹窗开关 atom 与打开 / 关闭函数
├── use-history-record-actions.ts  续播、定位、删除三个动作
└── use-history-records.ts      useLiveQuery 封装
services/history/records.ts     视图模型与纯函数（标题、进度、是否看完、影视库关联清理）
database/lib/history-writer.ts  deleteHistoryRecord
```

纯函数放在 `services/history/` 而不是组件目录：测试配置只收录 `services/` 下的测试，同时这部分逻辑不依赖 React。

### 2. 弹窗用全局 atom 打开，只挂载一次

沿用 `RemoteVideoDialog` 的写法：模块内一个 jotai atom 加 `openPlaybackHistoryDialog()`，弹窗组件在 `App.tsx` 根部按 `!isWeb` 挂载一次（与其他仅桌面端的全局组件放在一起）。入口只调用打开函数，不持有弹窗状态；弹窗独立于路由，日后增减入口不需要改动弹窗本身。

没有用 `ModalStackProvider`：弹窗没有层叠需求，现有的 `Dialog` 加 atom 已经是项目里跨页面弹窗的既定做法。

### 3. 读取：走 `updatedAt` 索引并立即瘦身

```text
db.history.orderBy('updatedAt').reverse().limit(n)
        │
        ▼ 立即映射为视图模型，丢弃 danmaku / subtitles / audioTrack
{ hash, title, thumbnail, cover, progress, duration, matched, source: 'local' | 'remote' | 'other', path? }
```

- 弹窗 `n = 200`，只在打开时查询；关闭后不保留结果，避免上百张缩略图常驻内存。
- 映射放在查询函数内部，React 状态和 liveQuery 缓存里不保留弹幕数据。
- 首页按钮只需要知道"有没有记录"，用 `db.history.count()` 判断，不读取记录内容；结果做跨挂载缓存，避免每次进入空态时按钮闪一下。
- 弹窗列表 200 条以内不做虚拟滚动，图片用 `loading="lazy"`。

没有选择给 `history` 另建一张轻量索引表：需要数据库迁移和双写一致性，而影视库现在每次进入已经在读取全部关联记录，量级相同且可接受。

### 4. 首页入口：一个同级按钮，不渲染历史内容

实现时先做过"空态底部一行最近播放缩略图"（贴底绝对定位、容器查询自适应张数），实物观感不佳，已撤回并删除该组件。

最终方案是在空态提示下方、"通过 URL 播放"按钮旁增加一个样式相同的"播放记录"按钮：

- 两个按钮包在同一行容器里，各自按条件渲染；都不满足时整行不存在，空态与最初一致。
- 只在 `!isWeb` 且至少有一条记录时显示。
- 首页仍然不读取、不渲染缩略图和标题，延续 `redesign-player-home` 的结论，只放宽"不得出现入口"这一条。

### 5. 续播统一走路由 state，来源可传入

弹窗内点击记录调用 `navigate(PLAYER, { state: { hash, source } })`，由现有的 `useLoadingHistoricalAnime` 消费。即使已经在播放器页，该 hook 也会按 hash 触发加载，因此不需要第二条加载路径。

该 hook 原本用一个 ref 记住已消费的 hash 防止重复加载，且从不清空。从影视库进入时播放器页会重新挂载，问题不显现；从播放器首页打开弹窗续播时与 hook 同页、不重新挂载，同一条记录取消加载后再次点击会被忽略。因此在路由 state 被清空（hash 为空）时重置该 ref。

- `loadHistoricalVideo` 增加可选的 `importSource` 参数，默认 `library`，三处 `markNextPlayerImportSource` 改为使用它。
- hook 从 `location.state.source` 读取来源并做白名单校验。
- `video_import_started.source` 新增 `history`。

### 6. 删除：一个事务内清理影视库关联

`deleteHistoryRecord(hash)` 在 `history` 与 `library` 两表的读写事务内：

1. 读取记录，不存在则直接返回。
2. `animeId` 非 0 时，把对应作品中 `fileHash === hash` 的剧集的 `fileHash` 清空。
3. 删除 `history` 记录。

- 影视库的 `watchedEpisodeIds` 和 `lastWatched` 指针不动：已看状态属于作品进度，不随文件记录消失；`pickNextEpisode` 只挑有 `fileHash` 的剧集，不会指向被删的那集。
- 两个界面都由 liveQuery 驱动，删除后自动更新。
- 当前已加载的视频不允许删除：菜单项根据加载服务当前状态里的 `video.hash` 置灰，避免播放期间的进度写入落空。
- 确认使用现有的 `useConfirmationDialog`，文案说明会清除播放进度、本地导入的弹幕、字幕与音轨偏好，不会删除视频文件。

没有选择"隐藏标记"式的软删除：需要额外字段和"再次播放后恢复显示"的规则，而用户对"删除记录"的预期就是清掉。

### 7. 标题、进度与缩略图规则

- 标题：已匹配为"作品名 集名"；未匹配取 `animeTitle`，为空时取 `source.name`。
- 是否看完：复用 `isCompleted`（进度 ≥ 90%），显示"已看完"。
- 图片：`thumbnail` → `cover` → 中性占位（图标加弱底色）；图片加载失败同样回退到占位。
- "在 Finder 中显示"只对 `electron-file` 来源提供，调用现有的 `ipcClient?.app.showItemInFolder`，文案按 `isWindows` 区分。

### 8. 右键菜单的层级

共用的 `ContextMenu` 组件原先写死 `z-50`，低于弹窗的 `--z-dialog`（200）。它此前只用在影视库页面上，没有进过弹窗；在播放记录弹窗里右键时，菜单被压在弹窗下面看不见，同时菜单的模态行为锁住了滚动和点击，表现为"右键没反应、页面卡死"。

改为与 `DropdownMenu`、`Popover`、`Select` 相同的 `z-(--z-popover)`（250），菜单与子菜单共两处。影视库卡片的右键菜单随之提高层级，它本来就应在页面内容之上，不改变可见行为。

### 9. 影视库不设入口

实现时曾在影视库标题栏右侧注入"播放记录"按钮，实物确认后认为不需要，已移除；影视库页面代码恢复原状。弹窗只有播放器空态一个入口。

### 10. 埋点

- 交互用 `captureFeatureUsed('playback_history', action, value)`，`action` 为 `open` / `play` / `reveal` / `delete`，均不带 `value`。
- 删除与在文件管理器中显示失败经 `reportOperationalError` 上报并给出 toast，不只写 `console.error`。
- 不新增产品事件，不加入关键事件列表；`docs/observability-runbook.md` 补充新的来源取值与 feature 名。

### 11. 测试

- `selectors.ts` 的标题、进度、看完判定、图片回退为纯函数，单元测试覆盖已匹配、未匹配、缺字段三类记录。
- `deleteHistoryRecord` 测试：未匹配记录只删 `history`；已匹配记录同时清掉对应剧集的 `fileHash` 且不动其他剧集与已看状态；记录不存在时不报错。
- `loadHistoricalVideo` 现有测试补充自定义来源的用例。
- 首页按钮与弹窗的观感通过 `pnpm dev` 在浅色、深色主题下确认。

## 风险与权衡

- **入口较深**：首页不展示内容，续播需要先打开弹窗再点记录，比直接点缩略图多一步。这是用首页的简洁换来的，已确认接受。
- **记录体积**：读取 200 条带完整弹幕的记录有一次性开销，无法在开发机上代表真实数据量。若实测弹窗打开明显卡顿，降低上限或改为分批读取。
- **排序反映"最近打开"而非"最近观看"**：加载视频就会更新 `updatedAt`，打开后立即关闭的视频也会排到最前。符合"最近播放"的直觉，不单独处理。
- **缩略图是片长中点一帧**：同一部番的不同集可能看起来相似，因此标题中的集名不能省略。
- **删除不可恢复**：本地导入的弹幕无法重新获取，只靠确认文案提示。
- **未匹配视频每次续播都会再弹匹配框**：已确认符合预期，本次不处理。
