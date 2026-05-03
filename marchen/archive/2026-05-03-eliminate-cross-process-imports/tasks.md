## 1. 创建 IpcRouter 接口类型

- [x] 1.1 在 `packages/shared/src/types/` 下创建 `ipc-router.ts`，手写 IpcRouter 接口（覆盖 app、player、setting、utils 四个 group 的所有方法签名）
- [x] 1.2 更新 `packages/shared/package.json` 的 exports，添加 `"./types/ipc-router": "./src/types/ipc-router.ts"`

## 2. 重命名 src/main/tipc/ → src/main/ipc/

- [x] 2.1 将 `src/main/tipc/` 目录重命名为 `src/main/ipc/`
- [x] 2.2 删除 `src/main/ipc/renderer-handlers.ts`（已迁移到 @marchen/shared 的重复文件）
- [x] 2.3 更新 main 进程内部所有 `@main/tipc` 的 import 路径为 `@main/ipc`

## 3. 添加类型校验并迁移 renderer 端引用

- [x] 3.1 在 `src/main/ipc/index.ts` 中添加双向类型校验（import IpcRouter from shared，与 MergeGroups 推导类型互相赋值）
- [x] 3.2 修改 `src/renderer/src/lib/client.ts`，将 `import type { IpcRouter } from '@main/tipc'` 改为 `import type { IpcRouter } from '@marchen/shared/types/ipc-router'`

## 4. 清理 tsconfig 和构建配置

- [x] 4.1 清理 `tsconfig.web.json`：移除所有 `src/main/` 的 include 条目和不存在的 `src/shared/src/**/*`
- [x] 4.2 更新 `tsconfig.web.json` 的 paths：移除 `@main/*` 映射（renderer 不再需要）
- [x] 4.3 更新 `tsconfig.node.json`：将 include 中的 `src/main/tipc` 引用改为 `src/main/ipc`（如果有的话，实际上 `src/main/**/*` 已覆盖）

## 5. 验证

- [x] 5.1 运行 `pnpm typecheck` 确认两套 tsconfig 均通过
- [x] 5.2 运行 `pnpm build:web` 确认 Web 构建成功
- [x] 5.3 运行 `pnpm dev` 确认 Electron 开发服务器正常启动
