## 背景

上一轮 monorepo 重构已完成核心工作：创建 `@marchen/electron-ipc` 和 `@marchen/shared` 包，将 IPC 通信从 `@egoist/tipc` 迁移到自建方案。但 renderer 端仍通过 `import type { IpcRouter } from '@main/tipc'` 引用 main 进程代码。

`IpcRouter` 类型由 `MergeGroups<[typeof appGroup, ...]>` 推导而来，TypeScript 解析时需要遍历所有 group handler 的实现代码及其依赖（electron API、FFmpeg、文件系统操作等），导致 `tsconfig.web.json` 必须 include 大量 main 进程文件。

当前 `tsconfig.web.json` include 了：`src/main/tipc/**/*`、`src/main/lib/*`、`src/main/windows/*`、`src/main/modules/**/*`、`src/main/types/**/*`、`src/main/constants/*`。这些对 Web 构建完全无用。

## 目标与非目标

**目标：**
- renderer 端不再有任何 `@main/` 的 import（包括 type-only）
- `tsconfig.web.json` 不 include 任何 `src/main/` 路径
- main 端实现与接口的一致性通过编译时校验保证
- 完成 D7 遗留项：`src/main/tipc/` → `src/main/ipc/` 重命名
- 清理重复文件和无效 include

**非目标：**
- 不改变 IPC 的 runtime 行为
- 不改变 `@marchen/electron-ipc` 包的 API
- 不引入构建步骤（如自动生成 .d.ts）
- 不重构 handler 的业务逻辑

## 决策

### D1: 在 @marchen/shared 中手写 IpcRouter 接口（contract-first）

**选择**：手写接口描述 renderer 端的调用签名。

**备选方案**：
- 保持从 main 推导（现状）→ 无法消除跨进程引用
- 自动生成 .d.ts → 引入构建步骤，增加复杂度
- 把 group 定义移到 shared → group 实现依赖 electron API，不可行

**理由**：手写接口是唯一不引入额外工具链的方案。接口只描述"调用签名"（输入类型 → 输出类型），不涉及实现细节。通过 `satisfies` 在编译时保证一致性，新增/修改 handler 忘记更新接口会立即报错。

**代价**：每次修改 handler 签名需要同步更新两处。但这个项目的 IPC handler 变动频率低（当前 18 个方法，稳定期），且 TypeScript 会在忘记同步时报错。

### D2: satisfies 校验放在 main 端的 index.ts

在 `src/main/ipc/index.ts` 中，对合并后的 router 对象做 `satisfies IpcRouter` 校验：

```typescript
import type { IpcRouter } from '@marchen/shared/types/ipc-router'

// 编译时校验：确保实现覆盖了接口定义的所有方法
export const ipcGroups = [...] 
export type IpcRouterImpl = MergeGroups<[...]>

// 类型断言：如果实现与接口不匹配，这里会报错
const _typeCheck: IpcRouterImpl = {} as IpcRouter  // 双向校验
const _typeCheck2: IpcRouter = {} as IpcRouterImpl
```

**理由**：双向赋值校验比单向 `satisfies` 更严格——既防止实现缺少方法，也防止接口多出不存在的方法。

### D3: IpcRouter 接口只描述 renderer 端可见的调用签名

接口格式为：
```typescript
export interface IpcRouter {
  app: {
    windowAction: (input: {...}) => Promise<void>
    checkUpdate: () => Promise<...>
    ...
  }
  player: { ... }
  setting: { ... }
  utils: { ... }
}
```

不使用 `IpcHandler`、`IpcGroup` 等内部类型——接口是纯粹的"方法签名"描述，renderer 端只需要知道"调什么、传什么、返回什么"。

**理由**：最小化接口的依赖。shared 包的 ipc-router.ts 不需要 import `@marchen/electron-ipc` 的任何内容。

### D4: 目录重命名 tipc → ipc 与本次变更一起做

虽然可以单独做，但与本次变更一起做可以减少一次全量 import 路径更新。重命名后 `@main/tipc` 变为 `@main/ipc`，只影响 main 进程内部的 import（renderer 已不再引用 `@main/` 任何路径）。

### D5: tsconfig.web.json 的 include 只保留 renderer 和 packages

清理后的 include：
```json
"include": [
  "src/renderer/src/env.d.ts",
  "src/renderer/src/**/*",
  "src/renderer/src/**/*.tsx",
  "src/preload/*.d.ts",
  "packages/electron-ipc/src/**/*",
  "packages/shared/src/**/*",
  "types/**/*.d.ts",
  "src/env.ts"
]
```

移除：`src/main/tipc/**/*`、`src/main/lib/*`、`src/main/windows/*`、`src/main/modules/**/*`、`src/main/types/**/*`、`src/main/constants/*`、`src/shared/src/**/*`（不存在）。

## 风险与权衡

### R1: handler 返回类型的精确性

部分 handler 的返回类型较复杂（如 `getAnimeDetailByPath` 返回联合类型 `{ ok: 0, message } | { ok: 1, ... }`）。手写接口时需要精确匹配这些类型，否则 satisfies 校验会失败。

**缓解**：先从 main 端推导出当前类型（通过 IDE hover 或 `tsc --declaration`），然后手写到接口中。首次编写后通过 typecheck 验证。

### R2: 目录重命名的 git diff 噪音

`src/main/tipc/` → `src/main/ipc/` 会产生文件移动的 diff。git 通常能识别 rename，但如果同时修改文件内容，可能显示为 delete + add。

**缓解**：分两步提交——先重命名（纯 mv），再修改内容。或者接受一次性 diff（文件数量少，5 个文件）。

### R3: 未来新增 handler 的工作流

新增 handler 后需要同步更新 `@marchen/shared/types/ipc-router.ts`。如果忘记，`pnpm typecheck` 会报错（D2 的双向校验保证），但错误信息可能不够直观。

**缓解**：在 ipc-router.ts 文件头部添加注释说明更新流程。
