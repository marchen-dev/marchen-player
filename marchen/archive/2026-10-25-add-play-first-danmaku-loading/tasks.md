## 1. 设置与策略注入

- [x] 1.1 在 `playerSettingAtom` 中新增 `enablePlayFirst`，默认 `false`，确认旧设置会通过默认值合并补齐。
- [x] 1.2 在通用设置「播放」分组的 `PlayerEngineSetting` 下方添加「优先播放视频」开关和说明文案，遵循默认箭头指针规则。
- [x] 1.3 给 `ServiceDeps` 增加可选的 `policy.playFirst`，在 `services/player-loading/index.ts` 中通过 `jotaiStore` 注入；`executeFullLoad` 开始时读取一次并固化到本次操作。

## 2. 状态机扩展

- [x] 2.1 在 `ReadyState` 中新增 `background`、`matchCandidates`、`matchError` 字段，在 `danmakuStatus` 中增加 `'unmatched'`；补充 `playFirstReady`、`backgroundPhase`、`backgroundSettled`、`backgroundUnmatched`、`backgroundMatchFailed` 这几个事件。
- [x] 2.2 在 reducer 中实现这些事件：后台事件只在 `ready` 且有 `background` 时才接受；`backgroundSettled` 只替换匹配和弹幕，并清除 `background`、`matchError` 和候选。
- [x] 2.3 调整 `canExecute`：`rematch`、`retryDanmaku` 允许在后台加载期间执行；`retryMatch` 允许在 `ready` 且有 `matchError` 时执行；执行这些命令时都不离开 `ready`。（实现说明：播放中的手动匹配沿用 UI 现有的弹窗加 `rematch` 入口，`manualMatch` 命令仍只用于加载页的 `match_failed`）
- [x] 2.4 检查所有用 `match.episodeId === 0` 判断「未匹配」的调用点（`getMatchInfo`、遥测 observer、`canExecute` 等），在有 `background` 时不要误判。

## 3. 优先播放加载 pipeline

- [x] 3.1 实现本地探测：`history.get`、`getAvailableDanmaku`、`isStale` 只读本地；读取出错时按「没有本地数据」处理；按 design 决策 3 的表格决定开播时带的数据和后台阶段。
- [x] 3.2 发出 `playFirstReady` 前，按跳过路径保存可恢复的 HISTORY 来源和已知匹配；开关关闭时 `executeFullLoad` 的行为完全不变。
- [x] 3.3 在同一个加载 Observable 里接着执行后台段：先匹配（网络），再获取弹幕（强制刷新或首次请求）；分别发出阶段、成功、无精确匹配、匹配失败和弹幕失败事件。
- [x] 3.4 后台提交时读取当前状态里的非 `auto` 来源和 `selected`，再与新的在线弹幕合并；通过 `sourceWrites` 和 `cache.commit` 的 `isCurrent` 串行写入；持久化失败不报成上游失败。
- [x] 3.5 `retryMatch` 在 `ready{matchError}` 时重新进入后台匹配段，不重新导入文件、不重新计算 hash、不重开视频。

## 4. 播放器 UI

- [x] 4.1 在 `getMatchInfo` 和 `MatchInfo` 中增加「正在匹配 / 正在加载弹幕」和「未精确匹配」两种显示，保持手动匹配和重试入口。
- [x] 4.2 在 `MatchResultToast` 中增加三种提示：「未精确匹配，点此手动匹配」、匹配失败时的「重试匹配」、缓存过期刷新失败时的「弹幕更新失败」；后台成功沿用「已自动匹配弹幕」；本地缓存有效时直接开播不弹提示。
- [x] 4.3 播放器内的 `MatchDanmakuDialog` 从 service 状态读取 `matchCandidates`，转换后作为 `matchData` 传入；确认不会触发 `MatchAnimeDialog` 的自动弹出，选中后走 `rematch`。
- [x] 4.4 在 Web 全屏和 Electron 全屏下检查新 Toast 的位置、键盘操作和辅助技术可感知性。

## 5. 遥测

- [x] 5.1 在 `contracts.ts` 中给 `video_import_completed` 和 `danmaku_match_completed` 增加 `load_mode`，给 `result` 增加 `'unmatched' | 'failed'`；新增 `playback_ready` 事件并加入 `CRITICAL_TELEMETRY_EVENTS`。
- [x] 5.2 修改 `player-loading-observer.ts`：play-first 模式下开播时发 `playback_ready`，后台结束时才发 `danmaku_match_completed`；complete 模式下两者同时发出；中途切换操作按 `cancelled` 记录；更新对应测试。
- [x] 5.3 后台请求失败经过 telemetry 错误边界上报，`AbortError` 和已失效的操作不上报；同步更新 `docs/observability-runbook.md`。

## 6. 测试与验收证据

- [x] 6.1 `player-loading` 单测：开关关闭的回归；本地探测四种情况；本地读取失败；后台成功、无精确匹配、匹配失败、弹幕失败、零条弹幕。
- [x] 6.2 隔离与并发单测（用可控 Promise）：后台加载中切集、`cancel`、同 hash 重开、手动 `rematch`；后台请求期间导入本地弹幕，两者都保留；相邻 tick 的竞态；迟到结果不写历史、不弹提示。
- [x] 6.3 运行 `pnpm typecheck`、`pnpm lint`、`pnpm test:player-runtime` 和 `player-loading` 包的测试。
- [x] 6.4 真实播放器验证（Electron 与 Web）：首次打开立即开播，弹幕在播放、暂停、倍速三种状态下中途接入，媒体会话、进度和暂停状态都不变，在屏弹幕无闪烁、无重复；本地缓存有效时开头弹幕正常；无精确匹配时 Toast 和候选弹窗正常。未验证的平台在 evidence 中写明。

> 4.4、6.4 的真实播放器验证由用户完成（2026-10-25）。
