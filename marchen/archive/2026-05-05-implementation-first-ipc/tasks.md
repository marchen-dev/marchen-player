## 1. 重写 @marchen/electron-ipc 包

- [x] 1.1 重写 `packages/electron-ipc/src/types.ts`：定义 `ActionContext`、`ActionFunction`、`RouterType`、`ClientFromRouter`（嵌套 group 版本）类型
- [x] 1.2 新建 `packages/electron-ipc/src/tipc.ts`：实现链式构建器 `createChainFns` 和 `tipc.create()`，返回 `{ procedure }` 对象
- [x] 1.3 重写 `packages/electron-ipc/src/main.ts`：导出 `tipc`（即 `t`）、实现新的 `registerIpc(router)` 遍历两层结构注册 handler，保留 `createEmitter` 不变
- [x] 1.4 重写 `packages/electron-ipc/src/renderer.ts`：`createClient` 改为接受 `RouterType` 泛型，双层 Proxy 逻辑保持不变，保留 `createListener` 不变

## 2. 改写 main 端 handler 定义

- [x] 2.1 改写 `src/main/ipc/setting.ts`：从 `defineGroup('setting', { ... })` 改为 `export const settingGroup = { method: t.procedure.action(...) }` 格式
- [x] 2.2 改写 `src/main/ipc/app.ts`：同上格式改写
- [x] 2.3 改写 `src/main/ipc/player.ts`：同上格式改写
- [x] 2.4 改写 `src/main/ipc/utils.ts`：同上格式改写
- [x] 2.5 改写 `src/main/ipc/index.ts`：导出 `router` 对象（组合所有 group）和 `type Router = typeof router`，调整 `registerIpc` 调用

## 3. 调整 renderer 端和配置

- [x] 3.1 修改 `tsconfig.web.json`：在 paths 中添加 `@main/*`，在 include 中添加 `src/main/ipc/**/*`
- [x] 3.2 修改 `src/renderer/src/lib/client.ts`：将 `import type { IpcRouter } from '@marchen/shared/types/ipc-router'` 改为 `import type { Router } from '@main/ipc'`，`createClient<IpcRouter>` 改为 `createClient<Router>`
- [x] 3.3 删除 `packages/shared/src/types/ipc-router.ts`

## 4. 验证

- [x] 4.1 运行 `pnpm typecheck` 确认无类型错误
- [x] 4.2 运行 `pnpm dev` 确认 IPC 通信正常工作
- [x] 4.3 验证 Go to Definition 从 renderer 端调用跳转到 main handler 实现
