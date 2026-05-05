## 1. 基础设施

- [x] 1.1 创建 `packages/player-core/` 目录结构和 `package.json`（依赖 rxjs）
- [x] 1.2 配置 `tsconfig.web.json` 添加 `@marchen/player-core/*` path alias
- [x] 1.3 根 `package.json` 添加 rxjs 依赖，运行 pnpm install

## 2. player-core 类型定义

- [x] 2.1 创建 `packages/player-core/src/types.ts`：定义 LoadingState union、Command types、所有 Port 接口（DanmakuAPI、DanmakuCache、VideoImporter、HistoryStore、PlayerBridge）

## 3. player-core 状态机

- [x] 3.1 创建 `packages/player-core/src/state-machine.ts`：状态转换规则（reduce 函数，接收 state + event 返回新 state）

## 4. player-core Pipeline

- [x] 4.1 创建 `packages/player-core/src/pipelines/load.ts`：主加载 pipeline（import → hash → match → [wait user] → danmaku → ready → playing）
- [x] 4.2 创建 `packages/player-core/src/pipelines/rematch.ts`：播放中重新匹配 pipeline（reloading → fetch → update player → playing）

## 5. player-core Service

- [x] 5.1 创建 `packages/player-core/src/service.ts`：PlayerLoadingService class（command$ Subject、switchMap/exhaustMap 编排、state$ 输出）
- [x] 5.2 创建 `packages/player-core/src/index.ts`：导出 Service class + 所有类型

## 5.5 player-core 单元测试

- [x] 5.5.1 配置 vitest：`packages/player-core/vitest.config.ts`，根 package.json 添加 `test:player-core` script
- [x] 5.5.2 创建 `packages/player-core/tests/helpers/mock-ports.ts`：mock 工厂（mockAPI、mockCache、mockImporter 等）
- [x] 5.5.3 创建 `packages/player-core/tests/service.test.ts`：状态机转换测试（正常加载、未匹配→用户选择、跳过弹幕、取消）
- [x] 5.5.4 创建 `packages/player-core/tests/pipelines/load.test.ts`：加载 pipeline 测试（缓存命中、新番刷新、网络错误）
- [x] 5.5.5 创建 `packages/player-core/tests/pipelines/rematch.test.ts`：播放中重新匹配测试（热更新弹幕、PlayerBridge 调用）

## 6. Adapter 实现

- [x] 6.1 创建 `src/renderer/src/services/player-loading/adapters/dandanplay-api.ts`：DanmakuAPI 实现
- [x] 6.2 创建 `src/renderer/src/services/player-loading/adapters/indexeddb-cache.ts`：DanmakuCache 实现
- [x] 6.3 创建 `src/renderer/src/services/player-loading/adapters/electron-importer.ts`：VideoImporter (Electron) 实现
- [x] 6.4 创建 `src/renderer/src/services/player-loading/adapters/web-importer.ts`：VideoImporter (Web) 实现
- [x] 6.5 创建 `src/renderer/src/services/player-loading/adapters/history-store.ts`：HistoryStore 实现

## 7. Service 组装和 React 桥接

- [x] 7.1 创建 `src/renderer/src/services/player-loading/index.ts`：组装 service 实例（注入所有 adapter）
- [x] 7.2 创建 `src/renderer/src/services/player-loading/hooks.ts`：usePlayerLoading hook（订阅 state$，支持 selector）

## 8. React 组件适配

- [x] 8.1 重写 `page/player/index.tsx`：用 service.loadFromFile/loadFromPath 替代 useVideo
- [x] 8.2 重写 `loading/PlayerProvider.tsx`：订阅 state$ 渲染 Timeline/Dialog/children，零 useEffect 业务逻辑
- [x] 8.3 修改 `initialize/hooks.tsx`：从 service state 读取弹幕数据，连接 PlayerBridge
- [x] 8.4 修改 `initialize/Event.tsx`：用 service.loadFromPath 替代 importAnimeViaIPC
- [x] 8.5 修改 `components/modules/player/index.tsx`：播放器初始化后 connectPlayer，销毁时 disconnectPlayer
- [x] 8.6 修改 `providers/IpcListener.tsx`：用 service.loadFromPath 替代 importAnimeViaIPC
- [x] 8.7 修改 `setting/damaku/DanmakuSource.tsx`：从 service state 读弹幕源，用 service.rematch
- [x] 8.8 修改 `setting/damaku/AddDanmaku.tsx`：用 service.addLocalDanmaku
- [x] 8.9 修改 `setting/playList/PlayList.tsx`：用 service.loadFromPath
- [x] 8.10 修改 `shared/MatchDanmakuDialog.tsx`：用 service.rematch

## 9. 清理旧代码

- [x] 9.1 删除 `loading/hooks.ts`
- [x] 9.2 删除 `loading/dialog/hooks.ts`（showMatchAnimeDialogAtom 移入 service 或独立文件）
- [x] 9.3 修改 `atoms/player.ts`：删除 loadingDanmuProgressAtom、danmakuDataAtom、currentMatchedVideoAtom、LoadingStatus、isLoadDanmakuAtom、isPlayingAtom，简化 useClearPlayingVideo

## 10. 验证

- [x] 10.1 运行 typecheck 确认无类型错误
- [ ] 10.2 手动测试：拖拽导入 → 匹配 → 弹幕加载 → 播放
- [ ] 10.3 手动测试：历史记录续播
- [ ] 10.4 手动测试：播放中重新匹配弹幕库
- [ ] 10.5 手动测试：播放中导入本地弹幕文件
