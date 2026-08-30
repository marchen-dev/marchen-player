# 播放器迁移矩阵

本表记录切换前的活跃能力、入口、副作用和平台差异。后续删除旧运行时时，必须逐项确认目标链路已经覆盖；文档、archive 和 changelog 中的历史引用不属于活跃运行时代码。

| 能力 | 当前入口与实现 | 当前副作用/约束 | Electron | Web | 新运行时归属 | 验收重点 |
| --- | --- | --- | --- | --- | --- | --- |
| 播放器创建 | `components/modules/player/initialize/hooks.tsx` 的 `useXgPlayer` | 创建模块级 xgplayer 实例，读取 loading state、历史进度和设置 | 是 | 是 | `PlayerRuntime` + `HtmlVideoMediaAdapter` | 换片时旧实例事件不可污染新会话 |
| 基础播放配置 | `initialize/config.ts` | 自动播放、音量、倍速、旋转、迷你进度、键盘和点击行为由 xgplayer 配置驱动 | 客户端配置 | Web 配置 | `PlaybackSession` + 自研 controls | autoplay 拒绝降级为可操作暂停态 |
| 播放/暂停 | `initialize/Event.tsx` 直接操作 `player.media` | 单击延迟 200ms 以区分双击 | 是 | xgplayer 默认行为 | InteractionSurface + commands | 触屏首次点击仅唤起控制器 |
| Seek/时间轴 | xgplayer 内置控件 | 起播位置由 `startTime` 注入 | 是 | 是 | `TimelineScrubber` + `PlaybackSession.seek` | 拖动结束恢复原播放状态 |
| 音量/静音/倍速/旋转 | xgplayer 内置插件 | 配置索引决定控件顺序 | 是 | 是 | FloatingController / PlayerInspector | 语义化控件、键盘与状态同步 |
| 全屏 | `plugins/fullScreen`、`initialize/Event.tsx`、xgplayer CSS fullscreen | Electron 调 IPC；Escape 同时处理窗口和 CSS fullscreen | BrowserWindow + CSS | Fullscreen API + CSS | `FullscreenPort` | 外部 Escape/系统切换后状态一致 |
| 退出播放 | `plugins/exit` 发出 `exit` 事件 | cancel loading、退出全屏、延迟 destroy | 是 | 是 | PlayerRuntime dispose + loading cancel | 资源释放顺序确定且恢复 AppShell |
| 上一集/下一集 | `plugins/previousEpisode`、`plugins/nextEpisode` | URL 列表挂在 xgplayer config，`PLAYNEXT` 转回文件路径 | 目录播放列表 | 不支持 | `PlaylistPort` | Web 显示 ±10 秒而非无效集数操作 |
| 自动下一集 | `initialize/Event.tsx` 的 `ENDED` | 读取 Jotai 设置并 emit `PLAYNEXT` | 是 | 禁用 | `PlaybackHistoryAdapter` + `PlaylistPort` | 统一经 player-loading 导入下一集 |
| 播放状态/错误 | xgplayer `Events` | ERROR 上报 Sentry；状态不独立 | 是 | 是 | `PlaybackSession` discriminated union | 编码错误与普通读取错误分开 |
| 进度保存 | `initialize/Event.tsx` 的 `TIME_UPDATE` | 2 秒 throttle 写 Dexie progress/duration | 是 | 是 | `PlaybackHistoryAdapter` | 高频时钟不进入 React/RxJS state |
| 续播 | `useXgPlayer` 创建配置前查 HISTORY | progress 等于 duration 时从 0 开始 | 是 | 是 | metadata 后恢复有效进度 | 接近完成阈值行为一致 |
| 已看标记 | `TIME_UPDATE` 超过 90% 与 `ENDED` | 写 library watched 状态 | 是 | 是 | `PlaybackHistoryAdapter` | 超过 90% 或自然结束均标记 |
| 缩略图 | `initialize/Event.tsx` 的 `grabFrame` | metadata 取中点，退出取当前或结尾前 3 秒，写 HISTORY | IPC FFmpeg | 不支持 | `SnapshotPort` + history observer | 失败不能阻塞播放/退出 |
| 弹幕数据转换 | `lib/danmaku` + `useXgPlayer` | 弹弹play评论转换成 danmu.js/xgplayer 格式 | 是 | 是 | dandanplay adapter → `DanmakuItem` | 模式、时间、颜色和文本一致 |
| 弹幕渲染 | xgplayer `Danmu` 插件 + `danmu.js` | DOM、mouseControl、hover pause、默认前 25% 区域 | 是 | 是 | `@marchen/danmaku-engine` | seek、倍速、高密度、遮挡区和节点池 |
| 弹幕热更新 | `PlayerBridge`、`DanmakuSource.tsx`、`useXgPlayerUtils` | rematch/本地导入后直接 clear/update xgplayer 实例 | 是 | 是 | player-loading `ready` 热更新订阅 | 不重建/不中断视频会话 |
| 弹幕设置 | `atoms/settings/player.ts` 与 setting items | 字号、时长、显示区域、繁简、迷你进度 | 是 | 是 | DanmakuEngine commands + UI state | 设置立即生效且持久化 |
| 字幕渲染 | `setting/items/subtitle/hooks.ts` | libass-wasm 从 `player.media` 取得 video，持有 worker/track | 是 | 外挂路径可走现有函数 | `LibassSubtitleAdapter` | 换轨、关闭、resize、dispose 无泄漏 |
| 内嵌字幕 | `InitializeSubtitle` + player IPC | 中文优先、历史默认、提取失败 toast | 是 | 不支持 | Electron `SubtitleCatalogPort` | 失败不影响视频和现有字幕 |
| 同目录/外部字幕 | subtitle hooks + IPC 转 ASS | Electron 记录 HISTORY；Web 不记录 | 是 | ASS/SSA 外挂 | 平台 SubtitleCatalog adapter | Object URL 与转换产物生命周期 |
| 字幕偏移 | `SubtitleTimeOff` + libass 实例 | 更新 timeOffset 和 HISTORY | 是 | 当前能力有限 | `LibassSubtitleAdapter.setOffset` | 立即生效，Electron 保持记录 |
| 播放器设置浮层 | `setting/Sheet.tsx` | Portal 容器硬编码查询 `.xgplayer` | 是 | 是 | `PlayerPortalRoot` | DOM fullscreen 内可见、可聚焦 |
| Web 文件来源 | `services/player-loading/adapters/web-importer.ts` | 创建 Object URL，当前无 release 契约；hash 失败也可能泄漏 | 不适用 | 是 | `SourceLifecyclePort` | hash 失败、换片、退出均撤销 |
| Electron 文件来源 | `electron-importer.ts` + `marchen://` | IPC 获取路径/目录列表并加入最近文件 | 是 | 不适用 | Electron source/playlist ports | 文件失败降级为当前文件播放 |
| 播放页面外壳 | `components/modules/player/index.tsx` + RootLayout | xgplayer 容器只做淡入淡出，普通应用布局仍参与 | 是 | 是 | fixed `PlayerShell` + surfaces | ready 后隐藏 AppHeader/Sidebar，退出恢复 |

## 删除门槛

- `@suemor/xgplayer`、`danmu.js`、旧插件目录和 `styles/player.css` 只能在所有对应行完成后删除。
- Renderer 活跃代码不得再读取第三方播放器实例、事件常量或 `.xgplayer` DOM。
- `@jellyfin/libass-wasm` 保留，但其生命周期必须由新字幕 adapter 独立管理。
- FFmpeg/MSE/EAC3/HEVC 兼容播放不属于本矩阵的迁移完成条件。

## 最终复核

2026-08-29 已逐项复核：上表能力均已迁移到 `@marchen/playback-core`、
`@marchen/danmaku-engine`、player-runtime ports/adapters 与自研响应式控制器。旧运行时、插件、
样式选择器和两个依赖已删除；Electron/Web/移动端证据及压力数据见 `verification.md`。
