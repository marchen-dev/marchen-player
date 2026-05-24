## 动机

当前弹幕加载流程用 async 函数 + jotai atom + useEffect 编排，存在根本性问题：

1. **状态分散**：loadingDanmuProgressAtom、danmakuDataAtom、currentMatchedVideoAtom 散落在 async 函数和 React 组件中，没有统一的状态源。
2. **useEffect 驱动业务逻辑**：PlayerProvider 用 useEffect 监听 hash 变化触发 pipeline，依赖 ref 防重复，脆弱且难以调试。
3. **多入口无统一控制**：拖拽、IPC、历史记录、播放列表切换、播放中重新匹配——5 种入口各自操作状态，容易冲突。
4. **播放中操作缺乏建模**：重新匹配弹幕库、添加本地弹幕等"热更新"操作没有独立的状态转换，和初始加载混在一起导致 bug。
5. **不可测试**：逻辑嵌在 React hooks 中，无法脱离组件树单独测试。

需要用 Class + RxJS 完全重写加载逻辑，将业务流程从 React 组件中抽离为独立的 Service 层。

## 变更内容

- 新建 `packages/player-core` 子包：纯 TypeScript + RxJS，定义状态机、Port 接口和 pipeline 编排
- 新建 `src/renderer/src/services/player-loading/` 目录：实现 adapter（API、缓存、导入器）和 React 桥接 hook
- 重写 `PlayerProvider`：从 useEffect 编排改为订阅 service.state$
- 重写所有加载入口：统一通过 service.dispatch() 触发
- 删除旧的 `loading/hooks.ts`：移除 startMatchAndLoad、continuePipeline、fetchDanmakuForEpisode 等散装函数
- 删除加载相关的 jotai atom：loadingDanmuProgressAtom、danmakuDataAtom、currentMatchedVideoAtom
- 播放中弹幕热更新：通过 PlayerBridge 接口直接操作播放器实例

## 能力

### 新增能力

- `player-core-service`：PlayerLoadingService class，状态机 + RxJS pipeline + Command dispatch
- `player-core-ports`：Port 接口定义（DanmakuAPI、DanmakuCache、VideoImporter、HistoryStore、PlayerBridge）
- `service-adapters`：各 Port 的具体实现（dandanplay API、IndexedDB 缓存、Electron/Web 导入器）
- `react-bridge`：usePlayerLoading() hook，订阅 state$ 并暴露给 React 组件

### 修改能力

- `player-provider`：从 useEffect 编排改为纯渲染（订阅 state$ 决定显示 Timeline/Dialog/Player）
- `danmaku-settings`：DanmakuSource 和 AddDanmaku 改为调用 service 方法

## 影响范围

- 新建：`packages/player-core/`（~7 文件）、`src/renderer/src/services/player-loading/`（~6 文件）
- 重写：`PlayerProvider.tsx`、`page/player/index.tsx`
- 修改：`initialize/hooks.tsx`、`initialize/Event.tsx`、`Player/index.tsx`、`IpcListener.tsx`、`DanmakuSource.tsx`、`AddDanmaku.tsx`、`PlayList.tsx`、`MatchDanmakuDialog.tsx`
- 删除：`loading/hooks.ts`、`loading/dialog/hooks.ts`（showMatchAnimeDialogAtom 移入 service）
- 修改：`atoms/player.ts`（删除加载相关 atom）
- 配置：`package.json`（加 rxjs）、`tsconfig.web.json`（加 path alias）
