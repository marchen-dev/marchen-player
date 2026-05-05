## 动机

当前 IPC 通信采用 contract-first 模式（通过 `declare module` 在 shared 包定义类型契约），导致 IDE 的 "Go to Definition" 无法从 renderer 端的调用跳转到 main 端的实际实现。开发时需要手动查找 handler 代码，严重影响开发体验。

原因是类型通过 module augmentation 定义在 `packages/shared/src/types/ipc-router.ts`，与实现代码（`src/main/ipc/`）完全分离。TypeScript 的 Go to Definition 只能追踪到类型声明，无法到达运行时实现。

改为 implementation-first 模式后，类型从实现代码通过 `typeof` 推导，Go to Definition 能直接跳转到 handler 定义处。同时参考 `@egoist/tipc` 的链式 API 设计（`t.procedure.input<T>().action(fn)`），保留当前的 group 命名空间调用方式（`ipcClient?.setting.getWindowIsFullScreen()`）。

## 变更内容

- 重写 `@marchen/electron-ipc` 包：从 contract-first 的 `defineGroup` API 改为 tipc 风格的 `t.procedure.input<T>().action(fn)` 链式 API
- 改写 `src/main/ipc/` 下所有 handler 定义：从 `defineGroup('name', { ... })` 改为普通对象 + `t.procedure` 链式调用
- 改写 `src/main/ipc/index.ts`：导出 `router` 对象和 `Router` 类型（`typeof router`）
- 改写 `src/renderer/src/lib/client.ts`：从 shared 的 `IpcRouter` 改为从 `@main/ipc` 导入 `Router` 类型
- 删除 `packages/shared/src/types/ipc-router.ts`（contract 文件不再需要）
- 修改 `tsconfig.web.json`：添加 `@main/*` 路径别名和 main IPC 文件的 include

## 能力

### 新增能力

- `tipc-chain-api`：tipc 风格的链式 handler 定义 API（`t.procedure.input<T>().action(fn)`），支持 group 命名空间
- `typeof-router-type`：基于 `typeof router` 的类型推导，实现 Go to Definition 跳转到实现

### 修改能力

- `ipc-client-creation`：renderer 端 createClient 的类型来源从 module augmentation 改为 typeof 推导
- `ipc-handler-registration`：main 端 registerIpc 从接收 group 数组改为接收 router 对象

## 影响范围

- `packages/electron-ipc/src/`：三个文件全部重写（main.ts、renderer.ts、types.ts）
- `packages/shared/src/types/ipc-router.ts`：删除
- `src/main/ipc/`：所有 handler 文件改写定义方式（app.ts、player.ts、setting.ts、utils.ts、index.ts）
- `src/renderer/src/lib/client.ts`：修改 import 来源
- `tsconfig.web.json`：添加路径别名和 include
- `src/main/index.ts` 或注册入口：registerIpc 调用方式调整
