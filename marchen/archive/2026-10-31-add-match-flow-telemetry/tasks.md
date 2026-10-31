## 背景

近 21 天 PostHog 数据显示：新视频（未命中播放记录）的自动匹配率约 25%，`danmaku_match_completed.result = none` 占比约 56%，但 `none` 只表示「用户跳过弹幕」，无法区分是在匹配中等不及、等待选择时没找到合适候选，还是匹配失败后放弃；总耗时也混入了用户在选择框上的犹豫时间，看不出接口、弹幕加载和远程 hash 各占多少。

方案：只在 renderer 的 `player-loading-observer` 中观察公开状态，补充低基数字段，不改 `packages/player-loading`、不新增事件、不改请求层。

- `danmaku_match_completed` 增加：`skip_from_step`（跳过或取消时所在步骤）、`candidate_count`（非精确匹配的候选数）、`match_origin`（auto / history / manual）、`matching_ms`、`user_wait_ms`、`danmaku_load_ms`（各步骤停留耗时）
- `video_import_completed` 增加 `hash_ms`
- 字段均为可选，旧客户端数据为空；不记录文件名、候选标题等高基数值

## 1. 事件契约

- [x] 1.1 在 `contracts.ts` 为 `danmaku_match_completed` 增加 `skip_from_step`、`candidate_count`、`match_origin`、`matching_ms`、`user_wait_ms`、`danmaku_load_ms` 可选字段并写中文注释
- [x] 1.2 在 `contracts.ts` 为 `video_import_completed` 增加 `hash_ms` 可选字段

## 2. Observer 采集

- [x] 2.1 在 `ActiveLoadingOperation` 中记录当前步骤进入时间，并按步骤累计 hashing / matching / waiting_user / loading_danmaku 停留时长
- [x] 2.2 `video_import_completed` 上报 `hash_ms`
- [x] 2.3 进入 `waiting_user` 时记录候选数；优先播放模式从 `ready.matchCandidates` 读取候选数
- [x] 2.4 跳过（`danmakuStatus = skipped`）与取消时记录所处步骤；优先播放后台阶段使用后台 phase
- [x] 2.5 `danmaku_match_completed`（含 cancelled）带上新增字段，`match_origin` 取自 ready 状态

## 3. 测试与文档

- [x] 3.1 在 `player-loading-observer.test.ts` 覆盖四种 `skip_from_step` 来源、候选数、各阶段耗时、`hash_ms`、优先播放后台路径与取消路径
- [x] 3.2 更新 `docs/observability-runbook.md` 说明新增字段口径与「新视频匹配率」拆解方法
- [x] 3.3 运行 observer 测试、`pnpm typecheck` 与 `pnpm lint`
