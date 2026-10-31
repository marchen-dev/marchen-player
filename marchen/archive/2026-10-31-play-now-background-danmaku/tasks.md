## 背景

加载过程中的「直接播放」目前会取消匹配和在线弹幕请求，只带本地缓存开播且之后不再匹配（`danmakuStatus: skipped`），容易被误解为与设置「优先播放视频」相同。改为让当前视频临时使用优先播放：从点击时所在步骤接着在后台完成剩余工作，复用优先播放已有的后台状态与事件。

- matching：开播后后台匹配并加载弹幕；loading_danmaku：沿用已得到的 match 后台加载弹幕
- waiting_user（选集弹窗按钮改为「稍后选择」）：直接以 unmatched 开播，保留内存候选供播放中手动匹配
- match_failed：以 matchError 开播，可在播放中原地重试，不自动后台重试
- ready 新增公开字段 `playNowFrom` 标记来源步骤；toast 只在 matching / loading_danmaku 点击后的后台结束时弹出，waiting_user / match_failed 不弹
- 命令 `skipDanmaku` 改名 `playNow`，删除 `skipped` 事件与 `danmakuStatus: 'skipped'` 链路
- 遥测：`LoadMode` 新增 `play_now`；`skip_from_step` 改由 `playNowFrom` 取值；同步 contracts 注释与 runbook 口径

## 1. player-loading 包

- [x] 1.1 types：命令 `skipDanmaku` → `playNow`，删除 `skipped` 事件，新增 `playNowReady` 事件（from、match、matchOrigin、danmaku、background、candidates、matchError），ReadyState 新增 `playNowFrom`，删除 `danmakuStatus` 的 `skipped`
- [x] 1.2 state-machine：处理 `playNowReady`，按来源生成 ready（后台阶段 / unmatched + 候选 / matchError），只接受 matching / loading_danmaku / waiting_user / match_failed
- [x] 1.3 service：`playNow` 读取本地弹幕并写 HISTORY 后发出 `playNowReady`，matching 接 `backgroundMatch`，loading_danmaku 接 `backgroundDanmaku`；`waitForUserSelection` 同步改名
- [x] 1.4 更新包内测试（service / recovery），覆盖四种来源的状态与后台结果

## 2. renderer UI

- [x] 2.1 Timeline：按钮调用 `playNow`，matching / loading_danmaku 时显示「弹幕将在后台继续加载」说明
- [x] 2.2 选集弹窗：等待选择场景按钮文案改为「稍后选择」，PlayerProvider 改调 `playNow`
- [x] 2.3 MatchResultToast：去掉 skipped 拦截，`playNowFrom` 为 waiting_user / match_failed 时不弹；清理 match-info 与 MatchInfo 的 skipped 展示

## 3. 遥测与文档

- [x] 3.1 contracts：`LoadMode` 新增 `play_now`，更新 `skip_from_step`、`result` 相关注释
- [x] 3.2 observer：看到 `playNowFrom` 时把 loadMode 改为 `play_now`，`skip_from_step` 取 `playNowFrom`；更新 observer 测试
- [x] 3.3 runbook：加载模式、开播与弹幕到达、新视频匹配率拆解三处口径同步 play_now
- [x] 3.4 运行 `pnpm test:player-runtime`、player-loading 包测试、`pnpm typecheck`、`pnpm lint`
