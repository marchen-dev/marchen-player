## 背景

上一轮变更（eliminate-cross-process-imports）将 `IpcRouter` 类型从 main 端推导移到了 shared 包手写。这解决了跨进程引用问题，但引入了新的维护负担：每个 handler 的类型需要在 shared 和 main 两处维护。

当前 `defineGroup` 的签名为 `defineGroup<TName, THandlers>(name, handlers)`，其中 `THandlers` 完全由传入对象推导，没有外部约束。`handler<Input>()` 需要手动指定输入类型泛型。

## 目标与非目标

**目标：**
- 消除类型重复维护：IPC 方法签名只在 shared 中定义一次
- `defineGroup` 自动校验实现完整性（缺方法、类型不匹配立即报错）
- handler 的输入类型从上下文自动推导，不需要 `handler<T>()` 手动指定
- 保持 `@marchen/electron-ipc` 包的通用性（不硬编码 shared 的导入路径）

**非目标：**
- 不改变 IPC 的 runtime 行为（channel 命名、Proxy 机制等）
- 不改变 renderer 端的 API（createClient、createListener）
- 不改变 handler 内部的业务逻辑

## 决策

### D1: 使用 TypeScript module augmentation 注入 IpcHandlerMap

`@marchen/electron-ipc` 包定义一个空的 `IpcHandlerMap` 接口，应用侧通过 module augmentation 扩展它：

```typescript
// packages/electron-ipc/src/types.ts
export interface IpcHandlerMap {}

// packages/shared/src/types/ipc-router.ts
declare module '@marchen/electron-ipc/types' {
  interface IpcHandlerMap {
    app: { ... }
    player: { ... }
  }
}
```

**备选方案**：让 `defineGroup` 接受显式泛型参数 `defineGroup<'app', AppHandlers>(...)`。

**理由**：module augmentation 让调用侧更简洁——`defineGroup('app', { ... })` 不需要任何额外泛型参数，TypeScript 自动从 augmented `IpcHandlerMap['app']` 获取约束。同时保持 electron-ipc 包的通用性。

**代价**：module augmentation 对不熟悉的开发者可能有认知成本。但本项目只有一个消费者，且模式固定。

### D2: 函数签名格式，IpcRouter = IpcHandlerMap

shared 中定义的类型直接就是 renderer 端看到的调用签名：

```typescript
interface IpcHandlerMap {
  app: {
    windowAction: (input: { action: 'close' | ... }) => Promise<void>
    checkUpdate: () => Promise<string>
  }
}
export type IpcRouter = IpcHandlerMap
```

**理由**：所见即所得，不需要中间转换层。renderer 端 `createClient<IpcRouter>` 直接使用。

### D3: 新增 ImplementHandlers 类型工具

将函数签名转换为 `IpcHandler` 对象：

```typescript
type ImplementHandlers<T> = {
  [K in keyof T]: T[K] extends (input: infer I) => Promise<infer O>
    ? IpcHandler<I, O>
    : T[K] extends () => Promise<infer O>
      ? IpcHandler<void, O>
      : never
}
```

`defineGroup` 的 handlers 参数类型为 `ImplementHandlers<IpcHandlerMap[TName]>`。

### D4: handler() 保留但泛型变为可选

`handler<TInput>()` 的泛型参数保留用于 TypeScript 上下文推导失败时的 fallback。正常情况下，`defineGroup` 的约束会通过 contextual typing 自动推导 `handler().action(fn)` 中 `fn` 的参数类型。

如果 TypeScript 的 contextual typing 无法穿透 `handler().action()` 的嵌套调用（需要实际验证），则改为让 `handler` 接受一个 phantom 类型参数，由 `ImplementHandlers` 的映射类型注入。

### D5: MergeGroups 类型保留但简化

`src/main/ipc/index.ts` 中的 `MergeGroups` 推导仍然保留（用于 `registerIpc` 的 runtime 注册），但不再需要导出 `IpcRouter` 类型或做双向校验。`IpcRouter` 完全来自 shared。

## 风险与权衡

### R1: TypeScript contextual typing 的穿透能力

`handler().action(async ({ input }) => ...)` 是一个嵌套的泛型函数调用。TypeScript 能否从外层 `ImplementHandlers<T>` 的约束推导到内层 `action` 回调的参数类型，需要实际验证。

**缓解**：如果推导失败，方案 B 是将 `handler().action()` 改为直接函数 `async ({ context, input }) => ...`，去掉 handler 包装层。这会牺牲未来的 middleware 扩展能力，但对当前项目够用。

### R2: module augmentation 的 IDE 支持

module augmentation 需要 tsconfig 正确 include 声明文件。当前项目的 tsconfig 已经 include 了 `packages/shared/src/**/*`，应该没问题。

**缓解**：如果 IDE 不识别 augmentation，回退到显式泛型参数方案 `defineGroup<'app', AppHandlers>(...)`。

### R3: 返回类型的精确性

contract-first 要求在 shared 中预先定义返回类型。部分 handler 的返回类型较复杂（联合类型），需要在 shared 中写清楚。但这比当前方案好——至少只写一次，且格式由开发者控制（不是 TypeScript 推导出的丑陋格式）。
