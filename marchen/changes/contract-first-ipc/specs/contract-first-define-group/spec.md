### 需求: defineGroup SHALL 通过泛型约束自动校验 handler 实现

`defineGroup` 的第一个参数（group 名称）作为 `IpcHandlerMap` 的键，自动约束第二个参数（handlers 对象）必须实现对应的所有方法。

#### 场景: 缺少 handler 方法时报错

WHEN `IpcHandlerMap['app']` 定义了 `windowAction`、`checkUpdate`、`openDevTools` 三个方法
AND `defineGroup('app', { ... })` 的 handlers 对象只实现了 `windowAction` 和 `checkUpdate`
THEN TypeScript 编译报错，提示缺少 `openDevTools`

#### 场景: handler 返回类型不匹配时报错

WHEN `IpcHandlerMap['app']['checkUpdate']` 定义为 `() => Promise<string>`
AND 实现中 `checkUpdate` 的 action 函数返回 `number`
THEN TypeScript 编译报错，提示返回类型不兼容

#### 场景: handler 输入类型自动推导

WHEN `IpcHandlerMap['app']['windowAction']` 定义为 `(input: { action: 'close' | 'minimize' }) => Promise<void>`
AND 实现中 `windowAction: handler().action(async ({ input }) => { ... })`
THEN `input` 参数的类型自动推导为 `{ action: 'close' | 'minimize' }`，无需手动指定 `handler<T>()`

### 需求: defineGroup SHALL 不依赖 IpcHandlerMap 的具体导入路径

`defineGroup` 通过泛型参数接收约束类型，不硬编码 `@marchen/shared` 的导入路径。`IpcHandlerMap` 作为泛型参数传入或通过 module augmentation 注入。

#### 场景: electron-ipc 包保持通用性

WHEN 其他项目使用 `@marchen/electron-ipc` 包
AND 该项目定义了自己的 IpcHandlerMap
THEN `defineGroup` 同样能提供类型约束

### 需求: handler() 的泛型参数 SHALL 变为可选

当 `defineGroup` 提供了类型约束时，`handler()` 不再需要手动指定 `<Input>` 泛型。保留 `handler<T>()` 的能力作为 fallback，但正常使用时不需要。

#### 场景: 无泛型参数的 handler 调用

WHEN 使用 `handler().action(async ({ input }) => { ... })`
AND defineGroup 的约束已指定该方法的输入类型
THEN `input` 类型正确推导，不需要 `handler<{ action: string }>()`
