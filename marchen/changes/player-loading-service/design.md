## 背景

当前加载流程用 async 函数 + jotai atom + useEffect 编排。状态散落在 5 个 atom、3 个 async 函数和 2 个 useEffect 中，多入口（拖拽/IPC/历史/播放列表/重新匹配）各自操作状态，导致竞态和 bug。播放中重新匹配没有独立的状态转换，和初始加载混用同一套逻辑。

## 目标与非目标

**目标：**

- 用 Class + RxJS 重写加载逻辑为独立 Service，脱离 React 生命周期
- 明确的状态机建模所有状态转换（含播放中操作）
- 所有入口统一为 Command，通过 service.dispatch() 触发
- 通过 Port 接口实现依赖反转，核心逻辑可独立测试
- React 层变为纯渲染：订阅 state$ + 调用 service 方法

**非目标：**

- 不改动播放器核心（xgplayer 初始化、事件绑定）
- 不改动字幕功能
- 不改动 API 请求层（request/api/comment.ts 已迁移完成）
- 不改动数据库 schema（DB_Danmaku 已简化完成）
- 不引入状态管理库替代 jotai（jotai 保留用于简单 UI 状态）

## 决策

### 1. 架构分层：packages/player-core + renderer/services/adapters

```
packages/player-core/        ← 纯逻辑，零平台依赖（只有 rxjs）
  ├── types.ts               ← State、Command、Port 接口
  ├── service.ts             ← PlayerLoadingService class
  ├── state-machine.ts       ← 状态转换规则
  └── pipelines/             ← RxJS pipeline 编排

src/renderer/src/services/player-loading/
  ├── adapters/              ← Port 实现（依赖 renderer 内部模块）
  ├── hooks.ts               ← React 桥接
  └── index.ts               ← 组装 service 实例
```

选择子包而非 renderer 内部目录：强制隔离，player-core 不能 import renderer 的任何东西。

### 2. 状态机设计（State Pattern）

状态定义为 discriminated union：

```typescript
type LoadingState =
  | { step: 'idle' }
  | { step: 'importing' }
  | { step: 'hashing'; video: Partial<VideoInfo> }
  | { step: 'matching'; video: VideoInfo }
  | { step: 'waiting_user'; video: VideoInfo; matchData: MatchResult }
  | { step: 'loading_danmaku'; video: VideoInfo; match: MatchedVideo }
  | { step: 'ready'; video: VideoInfo; match: MatchedVideo; danmaku: CommentModel[] }
  | { step: 'playing'; video: VideoInfo; match: MatchedVideo; danmaku: CommentModel[] }
  | { step: 'reloading'; video: VideoInfo; match: MatchedVideo; danmaku: CommentModel[] }
  | { step: 'error'; error: { message: string; previousStep: string } }
```

每个状态携带该阶段已有的数据，渐进填充。

### 3. RxJS 编排策略

```typescript
// 主加载流：switchMap 自动取消前一个
loadCommand$.pipe(
  switchMap(cmd => executeLoadPipeline(cmd))
)

// 播放中操作：exhaustMap 防重复
rematchCommand$.pipe(
  exhaustMap(cmd => executeRematchPipeline(cmd))
)

// 暂停/恢复：pipeline 内部等待 command
// waiting_user 时 pipeline 挂起，等 selectMatch/skipDanmaku command
// 用 race(selectMatch$, skipDanmaku$, cancel$).pipe(take(1))
```

关键 operator：
- `switchMap`：新 load 取消旧 load
- `exhaustMap`：rematch 防重复点击
- `concat`：pipeline 内步骤顺序执行
- `from`：Promise → Observable
- `race` + `take(1)`：等待用户选择
- `scan`：累积状态
- `shareReplay(1)`：多订阅者共享最新状态
- `catchError`：错误不终止流

### 4. PlayerBridge 连接机制

播放器初始化后调用 `service.connectPlayer(bridge)`，销毁时 `service.disconnectPlayer()`。

Service 内部在 rematch/addLocalDanmaku 完成后检查 bridge 是否已连接：
- 已连接 → 直接调用 bridge.updateDanmaku()
- 未连接 → 数据存在 state 中，播放器初始化时从 state 读取

### 5. React 桥接

```typescript
// 全局单例
const service = createPlayerLoadingService({ ...adapters })

// hook：订阅 + 选择性更新
function usePlayerLoading<T>(selector: (state: LoadingState) => T): T

// 使用
const step = usePlayerLoading(s => s.step)
const danmaku = usePlayerLoading(s => s.step === 'playing' ? s.danmaku : null)
```

用 `useSyncExternalStore` 或 `useEffect + subscribe` 桥接。selector 配合 `distinctUntilChanged` 避免不必要重渲染。

### 6. 删除清单

从 atoms/player.ts 删除：
- `loadingDanmuProgressAtom`、`LoadingStatus` enum
- `danmakuDataAtom`
- `currentMatchedVideoAtom`、`initialMatchedVideo`、`MatchedVideoType`
- `isLoadDanmakuAtom`、`isPlayingAtom`
- `useClearPlayingVideo` 中的相关 reset

保留：
- `videoAtom`（视频路径信息，被 Event.tsx 等使用）
- `playerSettingSheetAtom`（UI 状态）

删除文件：
- `loading/hooks.ts`（整个文件被 service 替代）
- `loading/dialog/hooks.ts`（showMatchAnimeDialogAtom 移入 service 或独立管理）

## 风险与权衡

### 风险 1: RxJS 学习曲线

项目首次引入 RxJS。后续维护者需要理解 switchMap/exhaustMap/scan 等概念。

**缓解**：只用 ~10 个核心 operator，pipeline 结构清晰（每个 pipeline 一个文件），注释说明 operator 选择的原因。

### 风险 2: Service 单例的生命周期

全局单例在 SPA 中不会被销毁。如果用户在页面间导航，service 状态需要正确重置。

**缓解**：离开播放页面时调用 service.cancel()，状态回到 idle。不需要销毁 service 本身。

### 风险 3: PlayerBridge 连接时序

播放器初始化是异步的（useXgPlayer 内部 useEffect），bridge 连接可能晚于 state 变为 playing。

**缓解**：播放器初始化时从 service.currentState 读取弹幕数据（同步读取），不依赖 bridge 推送。bridge 只用于"播放中"的热更新场景。

### 风险 4: 改动范围大

~27 个文件，包含核心加载流程的完全重写。

**缓解**：分阶段实现——先建 player-core 包（可独立验证），再写 adapters，最后改 React 层。每阶段可独立 typecheck。
