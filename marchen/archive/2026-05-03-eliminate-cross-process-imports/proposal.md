## 动机

上一轮 monorepo 重构（migrate-to-monorepo）的核心目标之一是"消除 main/renderer 之间的直接源码引用"。当前这个目标尚未完全达成：

- `src/renderer/src/lib/client.ts` 仍通过 `import type { IpcRouter } from '@main/tipc'` 直接引用 main 进程代码
- 由于 `IpcRouter` 类型是从 main 端 group 实现推导的，TypeScript 需要解析整个 handler 依赖链（`@main/lib/*`、`@main/windows/*`、`@main/modules/*`）
- 这迫使 `tsconfig.web.json` include 大量 main 进程代码（`src/main/tipc/**/*`、`src/main/lib/*`、`src/main/windows/*` 等）
- Web 构建不应关心 main 进程的存在，这违背了进程隔离的架构原则

此外还有若干遗留清理项：`src/main/tipc/renderer-handlers.ts` 与 `@marchen/shared` 中的定义重复，`tsconfig.web.json` include 了不存在的 `src/shared/src/**/*` 目录。

## 变更内容

- 在 `@marchen/shared` 中新增手写的 `IpcRouter` 接口类型，描述 renderer 端的 IPC 调用签名
- 修改 renderer 端 `client.ts` 的 import 路径，从 `@main/tipc` 改为 `@marchen/shared`
- 在 main 端添加 `satisfies` 类型校验，确保 group 实现与接口一致
- 清理 `tsconfig.web.json`，移除所有 `src/main/` 的 include 条目
- 删除 `src/main/tipc/renderer-handlers.ts` 重复文件
- 重命名 `src/main/tipc/` → `src/main/ipc/`（完成 D7 遗留项）

## 能力

### 新增能力

- `shared-ipc-router-type`：在 @marchen/shared 中定义 IpcRouter 接口类型，作为 main/renderer 之间的类型契约

### 修改能力

- `ipc-migration`：将 renderer 端的 IPC 类型引用从 main 源码迁移到 shared 包，并在 main 端添加类型校验

## 影响范围

- `packages/shared/`：新增 `types/ipc-router.ts`，更新 `package.json` exports
- `src/renderer/src/lib/client.ts`：修改 import 路径
- `src/main/tipc/`（重命名为 `src/main/ipc/`）：添加 satisfies 校验，删除重复的 renderer-handlers.ts
- `tsconfig.web.json`：移除 main 进程 include 条目，移除不存在的目录引用
- `tsconfig.node.json`：更新 paths 中的 `@main/*` 映射（如果重命名目录）
- `electron.vite.config.ts`：更新 alias（如果重命名目录）
