### 需求: IpcHandlerMap SHALL 使用函数签名格式定义所有 IPC 方法

每个方法的类型为 `(input: I) => Promise<O>` 或 `() => Promise<O>`，与 renderer 端调用签名一致。

#### 场景: IpcHandlerMap 覆盖所有现有方法

WHEN 对比 IpcHandlerMap 与当前 main 端 group 定义
THEN 包含 4 个 group（app、player、setting、utils）共 18 个方法，签名与实现一致

#### 场景: IpcHandlerMap 不依赖 main 进程代码

WHEN 检查 `packages/shared/src/types/ipc-router.ts` 的 import 语句
THEN 不存在任何来自 `src/main/`、`electron`、`fluent-ffmpeg` 等 main 进程专属模块的导入

### 需求: IpcRouter SHALL 直接等于 IpcHandlerMap

不需要额外的类型转换层，`IpcRouter = IpcHandlerMap`。renderer 端 `createClient<IpcRouter>` 直接使用。

#### 场景: renderer 端类型推导不变

WHEN renderer 端调用 `ipcClient?.app.windowAction({ action: 'close' })`
THEN 类型推导与改造前完全一致（参数类型、返回类型）

### 需求: 新增 handler 时 SHALL 只需修改 IpcHandlerMap

#### 场景: 新增方法的完整流程

WHEN 在 `IpcHandlerMap['app']` 中新增 `openDevTools: () => Promise<void>`
AND 未在 `src/main/ipc/app.ts` 的 defineGroup 中实现
THEN `pnpm typecheck` 报错，提示 app group 缺少 `openDevTools` 实现
AND 实现后 renderer 端自动获得 `ipcClient?.app.openDevTools()` 的类型推导
