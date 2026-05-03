## 1. 改造 @marchen/electron-ipc 类型系统

- [ ] 1.1 在 `packages/electron-ipc/src/types.ts` 中定义空的 `IpcHandlerMap` 接口（用于 module augmentation）
- [ ] 1.2 在 `packages/electron-ipc/src/types.ts` 中新增 `ImplementHandlers<T>` 类型工具（从函数签名提取 Input/Output 映射到 IpcHandler）
- [ ] 1.3 改造 `packages/electron-ipc/src/main.ts` 的 `defineGroup` 签名：泛型约束从 `IpcHandlerMap[TName]` 获取 handlers 类型

## 2. 重写 shared 的 IpcHandlerMap

- [ ] 2.1 重写 `packages/shared/src/types/ipc-router.ts`：使用 module augmentation 扩展 `IpcHandlerMap`，以函数签名格式定义所有 4 个 group 的方法
- [ ] 2.2 导出 `IpcRouter` 类型别名（等于 `IpcHandlerMap`）

## 3. 适配 main 端 group 文件

- [ ] 3.1 修改 `src/main/ipc/app.ts`：去掉 `handler<T>()` 的手动泛型参数
- [ ] 3.2 修改 `src/main/ipc/player.ts`：去掉 `handler<T>()` 的手动泛型参数
- [ ] 3.3 修改 `src/main/ipc/setting.ts`：去掉 `handler<T>()` 的手动泛型参数
- [ ] 3.4 修改 `src/main/ipc/utils.ts`：去掉 `handler<T>()` 的手动泛型参数

## 4. 清理

- [ ] 4.1 删除 `src/main/ipc/index.ts` 中的双向类型校验代码（`_implSatisfiesContract` 等）
- [ ] 4.2 清理 `src/main/ipc/index.ts` 中不再需要的 `MergeGroups` 导入和 `IpcRouterImpl` 类型（如果 registerIpc 不需要）

## 5. 验证

- [ ] 5.1 运行 `pnpm typecheck` 确认两套 tsconfig 均通过
- [ ] 5.2 验证 TypeScript contextual typing：确认 handler().action() 中 input 参数能自动推导（如果失败，回退到方案 B）
- [ ] 5.3 运行 `pnpm build:web` 确认 Web 构建成功
- [ ] 5.4 运行 `pnpm dev` 确认 Electron 开发服务器正常启动
