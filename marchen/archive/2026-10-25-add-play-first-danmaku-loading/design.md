## 背景

完整加载由 `packages/player-loading/src/service.ts` 的 `executeFullLoad` 编排：导入 → `matching` → `loading_danmaku` / `waiting_user` / `match_failed` → `ready`。所有命令共用同一个 `switchMap` 切换边界，所以新命令天然会终止旧分支。`session` 代次和 `sourceWrites` 负责隔离迟到写入。

`use-native-player-runtime.ts` 只在 `ready` / `reloading` 时创建媒体会话；`danmaku/context.tsx` 也只在这两个状态向引擎输出 `mergedComments`。因此视频要「先播」，状态机就必须在弹幕就绪前进入 `ready`；后台阶段不能退回 `matching` 或 `waiting_user`，否则媒体会话会被拆掉。

现有可复用的部分：

- `rematch.ts` 是播放中更新弹幕的 pipeline，`reloaded` 只替换匹配和弹幕，不重开视频。`add-loading-playback-recovery` 已经验证过它不改进度、不改暂停状态。
- `skipped` 已经在 `ready` 中用 `episodeId: 0` 表示没有匹配；`handleSkipDanmaku` 已经实现「用本地可用弹幕 + 写入可恢复来源」的开播路径。
- `restore-danmaku-after-seek` 提供按当前时间恢复在屏弹幕的能力，弹幕在播放中途到达时可以借用。
- 播放器内的 `MatchDanmakuDialog` 打开手动匹配时**不带候选**（只有影视库页面才请求 `matchData`），选中后调用 `service.rematch`。

`add-loading-playback-recovery` 把「立即播放、后台自动匹配」列为非目标。本变更把它作为默认关闭的可选模式重新引入，关闭时的行为保持不变。

## 目标与非目标

**目标：**

- 开关打开时，视频在导入并完成 hash 后尽快开播；本地数据可用时，开播就带着弹幕。
- 后台匹配和弹幕结果接入当前媒体会话，不重开视频、不改变播放状态。
- 无精确匹配、匹配失败、弹幕失败都不打断播放，并且有持续可见的恢复入口。
- 后台操作与切集、取消、手动匹配严格隔离，持久化顺序正确。
- 开关关闭时，现有加载路径和测试不受影响。

**非目标：**

- 不补发弹幕到达前已经过去的部分，不提示回到开头。
- 不改变 hash 计算、导入流程或媒体解码策略；开播仍然要等 hash 完成（匹配和历史都依赖它）。
- 不给本地读取加超时；不改服务端接口、数据库版本或移动端布局。
- 不重构 `ReadyState.match` 为判别联合（见决策 2）。

## 决策

### 1. 加载策略通过 Port 注入，在加载开始时快照

`ServiceDeps` 增加可选的 `policy: { playFirst: () => boolean }`。渲染端在 `services/player-loading/index.ts` 中从 `jotaiStore.get(playerSettingAtom).enablePlayFirst` 读取。`executeFullLoad` 开始时读一次并固化到本次操作，所以播放中切换开关只影响下一次加载。

不选「把设置作为 load 命令参数」：`loadFromPath` 的调用点很多（历史、播放列表、IPC、自动切集），逐个传参容易遗漏；而且这些调用方本来就不应该知道加载策略。纯 TS 包保持不依赖 Jotai。

`playerSettingAtom` 新增 `enablePlayFirst: false`。旧设置通过现有的默认值合并自动补齐。

### 2. 后台阶段是 `ready` 上的显式字段，不新增 step

```text
开关打开：
 importing → hashing → matching(本地探测，仅 IndexedDB)
                              │
                              ▼ playFirstReady
                     ready { background? }
                       │
       ┌───────────────┼──────────────────────┬────────────────────┐
       ▼               ▼                      ▼                    ▼
 background 完成   无精确匹配            匹配接口失败          弹幕接口失败
 → ready(loaded)   → ready{candidates}    → ready{matchError}   → ready{danmakuLoadFailed}
                     Toast 手动匹配         Toast 重试/手动         Toast 重试弹幕（已有）
```

`ReadyState` 新增：

- `background?: { phase: 'matching' | 'loading_danmaku' }`：后台进行中。字段存在时，`MatchInfo` 显示「正在匹配 / 正在加载弹幕」，不显示「未匹配」。
- `matchCandidates?: MatchResult`：无精确匹配时的候选，只存在内存，不写 HISTORY。
- `matchError?: { message: string }`：后台匹配接口失败，供 `retryMatch` 使用。
- `danmakuStatus` 增加 `'unmatched'`，与 `'skipped'` 区分（用户主动跳过 vs 后台确认没有精确匹配）。

不新增 step，原因是：媒体会话、弹幕上下文、控制栏和遥测都按 `ready` 判断「可以播放」，新增 step 要改的消费者更多，漏掉任何一个都可能拆掉正在播放的视频。不复用 `reloading`：它表示「用户对已有快照发起的恢复操作」，`canExecute` 在 `reloading` 时拒绝 `rematch`，而本变更要求后台加载期间允许用户手动匹配并覆盖后台结果。

`match` 继续用 `episodeId: 0` 表示未匹配，沿用 `skipped` 的约定。「匹配中」和「未匹配」的歧义由 `background` 字段消除。改成判别联合更严谨，但会牵动 `getMatchInfo`、遥测、`canExecute` 等所有读取 `match` 的地方，超出本次范围。

### 3. 本地探测决定开播时带什么数据

`hashed` 之后，play-first 分支执行一次只读本地的探测：`history.get`、`getAvailableDanmaku`、`cache.isStale`。探测出错按「没有本地数据」处理（spec：本地读取失败仍开播）。

| 本地情况             | 开播时                                     | 后台                           |
| -------------------- | ------------------------------------------ | ------------------------------ |
| 有匹配，缓存有效     | 匹配 + 缓存弹幕，`danmakuStatus: 'loaded'` | 无                             |
| 有匹配，缓存过期     | 匹配 + 旧缓存弹幕                          | `loading_danmaku`：强制刷新    |
| 有匹配，没有在线缓存 | 匹配 + 本地来源弹幕                        | `loading_danmaku`              |
| 没有匹配             | 只有本地来源弹幕，`episodeId: 0`           | `matching` → `loading_danmaku` |

第一行和开关关闭时的结果一致，只是少了网络等待，所以看过的集数开头不会丢弹幕。

开播事件 `playFirstReady` 发出前，先按 `handleSkipDanmaku` 的方式保存 HISTORY（`getPersistentMediaSource`、hash、已知匹配、可用弹幕），保证开播后立刻关闭也能从历史重新打开。

### 4. 后台加载留在同一个加载分支里

`executeFullLoad` 返回的 Observable 在发出 `playFirstReady` 后**继续**执行后台段，而不是另外启动一个订阅。这样：

- 新开视频、切集、`cancel` 时，`switchMap` 会自动退订后台段；
- 用户在后台期间触发 `rematch`、`retryDanmaku`、`retryMatch`、`manualMatch` 时也会切走后台段，以用户操作为准（spec：后台加载中手动匹配）；
- `LoadingOperations` 的 `AbortSignal` 同样覆盖后台请求。

`canExecute` 需要放开：`rematch` 和 `retryDanmaku` 在 `ready` 且有 `background` 时允许执行；`retryMatch` / `manualMatch` 在 `ready` 且有 `matchError` 时允许执行，执行后回到 `ready{background: matching}` 或打开手动匹配，都不离开 `ready`。

后台段的事件：

- `backgroundPhase { phase }`：从 matching 进入 loading_danmaku 时更新显示。
- `backgroundSettled { match, danmaku, mergedComments, matchOrigin, danmakuLoadFailed? }`：匹配和弹幕一起提交，复用 `reloaded` 的替换语义（不重开视频）。
- `backgroundUnmatched { candidates }`、`backgroundMatchFailed { message }`：结束后台，进入对应的提示状态。

reducer 只在 `ready` 且 `background` 存在时接受这些事件，其他情况直接丢弃。这是继 `session` 之后的第二层防线。

### 5. 提交时合并当前弹幕，并走 `sourceWrites` 队列

后台请求期间，用户可能导入本地弹幕或切换来源（`mutateDanmaku` 在 `ready` 时直接提交）。因此后台结果**不能**使用开播时的弹幕快照，必须在提交时读取当前状态的非 `auto` 来源和 `dandanplay` 的 `selected`，再拼上新的在线弹幕。

提交放进 `sourceWrites` 串行队列，并用 `cache.commit(hash, danmaku, isCurrent)` 在事务内复查 `session`。HISTORY 和缓存写入成功后才发出 `backgroundSettled`；写入失败时，弹幕仍按本次会话接入，但不报成上游失败（与 recovery 变更的持久化降级一致）。迟到或已失效的结果直接丢弃，不弹 Toast。

### 6. UI 复用现有区域

- **设置**：`General.tsx` 的「播放」分组在 `PlayerEngineSetting` 下面加一个 Switch「优先播放视频」，说明文案：「先播放视频，弹幕在后台加载完成后接入；开头可能缺少弹幕」。
- **`MatchResultToast`**：
  - `background` 结束、自动匹配成功时，沿用「已自动匹配弹幕」。
  - `danmakuStatus: 'unmatched'`：新增「未精确匹配」+ 动作「手动匹配」（spec 文案「未精确匹配，点此手动匹配」）。
  - `matchError`：「弹幕匹配失败」+「重试匹配」，手动匹配入口放在 `MatchInfo`。
  - 缓存过期刷新失败：已经有旧弹幕，标题用「弹幕更新失败」，不用「已匹配，弹幕加载失败」。
  - 本地缓存有效、直接开播时，沿用 `matchOrigin === 'history'` 不弹 Toast 的现有规则。
- **`MatchInfo` / `getMatchInfo`**：增加 `pending`（有 `background`）和 `unmatched` 两种显示；手动匹配入口保持不变。
- **候选传递**：播放器内的 `MatchDanmakuDialog` 从 service 状态读取 `matchCandidates`，转换成 `MatchAnimeDialog` 需要的 `MatchResponseV2` 后作为 `matchData` 传入。这里必须避开 `MatchAnimeDialog` 的自动打开逻辑：它在 `isLoading && !matchData.isMatched` 时会自动弹出，播放器内不传 `isLoading`，确保不会自动弹窗。
- **加载页**：开关打开时，加载页只在导入、hash 和本地探测的短时间内出现，「直接播放」按钮基本没机会显示，不需要特殊处理。

### 7. 遥测

- `contracts.ts`：`video_import_completed` 和 `danmaku_match_completed` 增加 `load_mode: 'complete' | 'play_first'`；`danmaku_match_completed.result` 增加 `'unmatched' | 'failed'`。新增 `playback_ready` 事件（`operation_id`、`load_mode`、`duration_ms`、`has_danmaku`），记录开播耗时，加入 `CRITICAL_TELEMETRY_EVENTS`。
- `player-loading-observer.ts`：play-first 模式下，进入 `ready` 时发 `playback_ready`，不结束本次操作；等 `background` 清除（结束、无匹配、失败）时才发 `danmaku_match_completed` 并结束 span。complete 模式下，`playback_ready` 与 `danmaku_match_completed` 在同一时刻发出。用户中途切换操作时按 `cancelled` 计。
- 后台请求失败沿用现有 `reportOperationalError` 的边界；`AbortError` 和已失效的操作不上报。
- 同步更新 `docs/observability-runbook.md`。

## 风险与权衡

- **开头丢弹幕**：这是有意接受的代价，已在开关说明中写明，默认关闭。
- **弹幕到达时的在屏表现**：依赖 seek 快照恢复的能力，「中途接入」是否能把当前应在屏的弹幕正确接上、会不会闪一下或重复出现，需要在真实播放器里验证（播放、暂停、倍速三种状态），不能只靠状态机测试。
- **放开 `canExecute`**：`rematch` 和 `retryDanmaku` 现在可以在后台加载期间执行。需要测试覆盖：同时点击、后台结果和用户操作在相邻 tick 到达、同 hash 重新打开。
- **`mutateDanmaku` 与后台提交并发**：两者都要经过 `sourceWrites`；要用可控延迟测试证明「后台请求中导入本地弹幕」这一场景两者都保留。
- **`episodeId: 0` 的歧义**：其他读取 `match.episodeId === 0` 的地方（例如遥测的 `skipped` 判断）在 `background` 存在时会误判为未匹配，实现时要逐个检查调用点。
- **Toast 种类变多**：新增的「未精确匹配」「匹配失败」「弹幕更新失败」都在全屏元素内显示，需要确认在 Web 全屏下不会被遮挡、可以用键盘操作。
- **验证范围**：要在 Electron 和 Web 两端都验证；Web 的证据不能代替 Electron 实测，没验证到的平台要在 evidence 中写明。
