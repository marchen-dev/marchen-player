### 需求: 包 SHALL 提供 defineGroup 函数用于在 main 进程定义带命名空间的 IPC handler

#### 场景: 定义一个 app group 并注册 handler
WHEN 调用 `defineGroup('app', { windowAction: handler<Input>().action(fn) })`
THEN 返回一个 group 对象，包含 groupName 和 handlers 映射

#### 场景: handler 接收 context 和 input 参数
WHEN handler 的 action 函数被调用
THEN 函数参数包含 `context.sender`（WebContents）和 `input`（类型化的输入）

### 需求: 包 SHALL 提供 registerIpc 函数将所有 group 注册到 ipcMain

#### 场景: 注册多个 group
WHEN 调用 `registerIpc([appGroup, playerGroup, settingGroup])`
THEN 每个 handler 注册为 `ipcMain.handle("{groupName}:{methodName}", ...)`

#### 场景: handler 被 renderer 调用时正确路由
WHEN renderer 通过 `ipcInvoke("app:windowAction", input)` 调用
THEN ipcMain 将请求路由到 appGroup 的 windowAction handler

### 需求: 包 SHALL 提供 createEmitter 函数用于 main 向 renderer 推送事件

#### 场景: 发送事件到 renderer
WHEN 调用 `createEmitter<RendererHandlers>(webContents)` 后调用 `emitter.windowAction.send(data)`
THEN 通过 `webContents.send("windowAction", data)` 发送事件

### 需求: 包 SHALL 提供 createClient 函数用于 renderer 端类型安全地调用 main handler

#### 场景: 创建带命名空间的 client proxy
WHEN 调用 `createClient<IpcRouter>(ipcInvoke)`
THEN 返回的 proxy 支持 `client.app.windowAction(input)` 形式的调用

#### 场景: client 调用正确映射到 IPC channel
WHEN 调用 `client.player.grabFrame({ path, time })`
THEN 实际调用 `ipcInvoke("player:grabFrame", { path, time })`

### 需求: 包 SHALL 提供 createListener 函数用于 renderer 端监听 main 推送的事件

#### 场景: 监听事件并返回取消函数
WHEN 调用 `listener.windowAction.listen(callback)`
THEN 注册 IPC 事件监听，返回 unlisten 函数

#### 场景: 调用 unlisten 后不再接收事件
WHEN 调用 unlisten 函数
THEN 移除对应的 IPC 事件监听

### 需求: 包 SHALL 提供 MergeGroups 类型工具用于合并多个 group 的类型

#### 场景: 合并后的类型支持命名空间访问
WHEN 定义 `type IpcRouter = MergeGroups<[typeof appGroup, typeof playerGroup]>`
THEN IpcRouter 类型支持 `router.app.windowAction` 和 `router.player.grabFrame` 的类型推导

### 需求: 包 SHALL 通过 package.json exports 分离 main 和 renderer 入口

#### 场景: main 进程导入
WHEN `import { defineGroup, handler, registerIpc, createEmitter } from '@marchen/electron-ipc/main'`
THEN 只导入 main 进程相关的代码（依赖 electron 的 ipcMain）

#### 场景: renderer 进程导入
WHEN `import { createClient, createListener } from '@marchen/electron-ipc/renderer'`
THEN 只导入 renderer 进程相关的代码（不依赖 electron 主进程模块）
