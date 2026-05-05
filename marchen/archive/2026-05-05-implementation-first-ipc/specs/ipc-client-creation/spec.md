### 需求: createClient SHALL 接受 RouterType 泛型参数并生成带命名空间的类型安全客户端

`createClient<Router>` 通过双层 Proxy 实现 `client.group.method(input)` 的调用方式，类型从 Router 的 typeof 推导。

#### 场景: 创建带命名空间的客户端

WHEN 调用 `createClient<Router>({ ipcInvoke: window.electron.ipcRenderer.invoke })`
THEN 返回的客户端对象支持 `client.setting.getWindowIsFullScreen()` 形式的调用
AND 每个 group 名称对应 router 对象的顶层 key
AND 每个 method 名称对应 group 内的 handler key

#### 场景: 客户端方法的类型与 handler 定义一致

WHEN handler 定义为 `t.procedure.input<{ path: string }>().action(async ({ input }) => "result")`
THEN 对应的客户端方法类型为 `(input: { path: string }) => Promise<string>`

#### 场景: 无输入参数的方法不需要传参

WHEN handler 定义为 `t.procedure.action(async () => true)`
THEN 对应的客户端方法类型为 `() => Promise<boolean>`

#### 场景: Web 环境下客户端为 null

WHEN `window.electron` 不存在（Web 环境）
THEN `ipcClient` 为 `null`
AND 调用方通过 `ipcClient?.group.method()` 可选链安全调用
