## 动机

当前 IPC 类型维护存在重复劳动：每新增或修改一个 handler，需要在两处同步类型——`src/main/ipc/` 的实现和 `packages/shared/src/types/ipc-router.ts` 的手写接口。手写接口中还包含 TypeScript 推导出的丑陋类型（如 `ok: number; message?: undefined`），可读性差。

根本原因是当前采用 inference-first 模式（先写实现，再手抄类型到 shared），而 `defineGroup` 没有外部类型约束能力。

改为 contract-first 模式：在 shared 中定义函数签名作为唯一类型源，`defineGroup` 通过泛型约束自动校验实现，消除重复维护。

## 变更内容

- 重写 `packages/shared/src/types/ipc-router.ts`：从手写调用签名改为 `IpcHandlerMap` 接口（函数签名格式），`IpcRouter` 直接等于 `IpcHandlerMap`
- 改造 `packages/electron-ipc/src/main.ts` 的 `defineGroup` API：接受 group 名称作为泛型约束键，自动从 `IpcHandlerMap` 查找对应方法签名并约束 handlers 参数
- 新增类型工具：从函数签名 `(input: I) => Promise<O>` 提取 `I`/`O` 并映射到 `IpcHandler<I, O>`
- 适配 `src/main/ipc/` 下 4 个 group 文件：去掉 `handler<T>()` 的手动泛型参数
- 删除 `src/main/ipc/index.ts` 中的双向类型校验代码（不再需要）

## 能力

### 新增能力

- `contract-first-define-group`：改造 defineGroup API，通过泛型约束从 IpcHandlerMap 自动校验 handler 实现

### 修改能力

- `shared-ipc-router-type`：将 IpcRouter 接口重写为 IpcHandlerMap 函数签名格式，作为 contract-first 的类型源

## 影响范围

- `packages/shared/src/types/ipc-router.ts`：重写为 IpcHandlerMap + IpcRouter 类型别名
- `packages/electron-ipc/src/main.ts`：defineGroup 签名变更
- `packages/electron-ipc/src/types.ts`：新增 ImplementHandlers 等类型工具
- `src/main/ipc/app.ts`、`player.ts`、`setting.ts`、`utils.ts`：去掉 handler 泛型参数
- `src/main/ipc/index.ts`：删除双向校验代码
