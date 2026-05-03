### 需求: renderer 端 SHALL 从 @marchen/shared 导入 IpcRouter 类型

`src/renderer/src/lib/client.ts` 必须从 `@marchen/shared/types/ipc-router` 导入 `IpcRouter`，不再引用 `@main/tipc`。

#### 场景: client.ts 不再引用 main 进程

WHEN 检查 `src/renderer/src/lib/client.ts` 的 import 语句
THEN 不存在任何 `from '@main/'` 的 import

#### 场景: renderer 端 IPC 调用行为不变

WHEN renderer 端调用 `ipcClient?.app.windowAction({ action: 'close' })`
THEN 行为与迁移前完全一致（channel 为 `app:windowAction`，参数正确传递）

### 需求: main 端 SHALL 使用 satisfies 校验实现与接口的一致性

main 端的 `IpcRouter` 导出类型必须通过 `satisfies` 或等效机制与 `@marchen/shared` 中的接口进行编译时校验。

#### 场景: main 端新增 handler 但未更新接口

WHEN 在 main 端某个 group 中新增一个 handler 方法
AND 未在 `@marchen/shared` 的 IpcRouter 接口中添加对应签名
THEN `pnpm typecheck` 报错，提示类型不匹配

#### 场景: main 端修改 handler 签名但未更新接口

WHEN 修改某个 handler 的输入类型（如 windowAction 的 action 新增一个值）
AND 未同步更新 IpcRouter 接口
THEN `pnpm typecheck` 报错

### 需求: tsconfig.web.json SHALL 不 include 任何 src/main/ 路径

#### 场景: Web 构建不依赖 main 进程代码

WHEN 从 `tsconfig.web.json` 的 include 数组中移除所有 `src/main/` 条目
THEN `pnpm typecheck` 和 `pnpm build:web` 均成功

### 需求: src/main/tipc/ SHALL 重命名为 src/main/ipc/

#### 场景: 目录重命名后所有引用更新

WHEN `src/main/tipc/` 重命名为 `src/main/ipc/`
THEN 所有 `@main/tipc` 的 import 路径更新为 `@main/ipc`
AND `pnpm typecheck` 成功

### 需求: 重复的 renderer-handlers.ts SHALL 被删除

#### 场景: 只保留 shared 包中的定义

WHEN 删除 `src/main/tipc/renderer-handlers.ts`（重命名后为 `src/main/ipc/renderer-handlers.ts`）
THEN 所有引用该文件的代码已改为引用 `@marchen/shared/types/renderer-handlers`
AND 编译成功
