## 背景

当前 `@marchen/electron-ipc` 采用 contract-first 架构：类型在 `packages/shared/src/types/ipc-router.ts` 通过 `declare module` 扩展 `IpcHandlerMap` 接口，main 端的 `defineGroup` 从该接口获取类型约束，renderer 端的 `createClient` 也引用同一接口。

这种模式的问题是 TypeScript 的 Go to Definition 无法穿透 module augmentation 到达实际实现。开发者在 renderer 端 Cmd+Click 一个 IPC 方法时，要么跳到空的 `IpcHandlerMap {}` 接口，要么跳到 `declare module` 块，永远到不了 `src/main/ipc/` 的 handler 代码。

参考对象 `@egoist/tipc` 使用 implementation-first 模式：类型通过 `typeof router` 从实现推导，Go to Definition 自然跳转到实现。但 tipc 是扁平结构（无命名空间），且已停止维护。

## 目标与非目标

**目标：**

- Go to Definition 从 renderer 调用跳转到 main handler 实现
- 保留 `ipcClient?.group.method()` 的命名空间调用方式
- 保留 `@marchen/electron-ipc` 包的独立性（自维护，不依赖外部库）
- 保留 emitter/listener 机制（main → renderer 事件推送）不变

**非目标：**

- 不改变 renderer → main 的 IPC 通信协议（仍然是 `ipcMain.handle` + `ipcRenderer.invoke`）
- 不改变 main → renderer 的事件推送机制（`createEmitter` / `createListener` 保持不变）
- 不改变 `@marchen/shared` 包中 IPC 无关的内容（protocol 常量、calc-file-hash 等）
- 不引入运行时 schema 校验（类型安全仅在编译时保证）

## 决策

### 1. 链式 API 设计：`t.procedure.input<T>().action(fn)`

采用 tipc 的链式构建器模式。`t.procedure` 返回一个 builder 对象，支持可选的 `.input<T>()` 和必须的 `.action(fn)`。

理由：
- 与 tipc 一致的开发体验，降低认知成本
- `.input<T>()` 是泛型调用，TypeScript 能精确推导 action 函数中 `input` 的类型
- 返回 `{ action: fn }` 的简单结构，`typeof` 能完整保留类型信息

### 2. Router 为普通对象，类型通过 typeof 推导

```
router = { setting: settingGroup, player: playerGroup, ... }
type Router = typeof router
```

理由：
- `typeof` 是 TypeScript 最直接的类型推导方式，Go to Definition 能追踪到源头
- 不需要额外的类型注解或泛型包装
- 新增 handler 只需在 group 对象中添加属性，无需同步更新契约文件

### 3. renderer 通过 `@main/*` 路径别名 import type

在 `tsconfig.web.json` 中添加 `@main/*` 路径别名，renderer 使用 `import type { Router } from '@main/ipc'`。

理由：
- `import type` 在编译时完全擦除，不产生运行时依赖
- Web 构建（Vite）不会将 main 代码打包进产物
- tsconfig.web.json 已经 include 了 `packages/electron-ipc/src/**/*`（含 Electron 类型引用），说明 Electron 类型在 web 上下文中已可解析
- 只需额外 include `src/main/ipc/**/*`（仅 IPC 定义文件，不是整个 main）

### 4. ClientFromRouter 类型提取支持嵌套 group

```typescript
type ClientFromRouter<Router extends RouterType> = {
  [G in keyof Router]: {
    [K in keyof Router[G]]: /* 从 action 签名提取 (input?) => Promise<output> */
  }
}
```

理由：
- 双层映射对应双层 Proxy 的运行时结构
- 类型提取逻辑与 tipc 的 `ClientFromRouter` 相同，只是多了一层 group 嵌套

### 5. registerIpc 接收 router 对象而非 group 数组

当前 `registerIpc([appGroup, playerGroup, ...])` 改为 `registerIpc(router)`，内部遍历两层结构。

理由：
- router 对象已经包含 group 名称（作为 key），不需要每个 group 内部再存储 `groupName`
- 与 `typeof router` 的类型结构一致，减少中间抽象

## 风险与权衡

### tsconfig.web.json include main 文件

风险：`pnpm typecheck` 的 web 配置会额外检查 `src/main/ipc/` 文件。如果这些文件有 web 上下文不兼容的类型问题，会报错。

缓解：当前 main IPC 文件只 import `electron` 和 `@main/` 下的工具函数。Electron 类型已在 web tsconfig 可解析。`@main/*` 路径别名需要同时添加到 web tsconfig 的 paths 中。如果某些 main 工具函数引入了 Node.js 特有类型，可能需要调整 include 范围（只 include `src/main/ipc/` 而非整个 `src/main/`）。

### 失去 contract-first 的"先定义后实现"约束

权衡：contract-first 强制开发者先想清楚接口再写实现。改为 implementation-first 后，接口由实现决定，可能导致接口设计不够审慎。

接受理由：对于这个项目规模（~15 个 IPC handler），contract-first 的额外约束带来的收益不如 Go to Definition 的 DX 提升大。如果未来 handler 数量大幅增长，可以通过 code review 保证接口质量。

### emitter/listener 不受影响

`createEmitter` 和 `createListener` 仍然使用 `RendererHandlers` 接口（定义在 shared 包），这部分保持 contract-first 是合理的，因为事件类型需要 main 和 renderer 双方共享，且事件数量少、变化不频繁。
