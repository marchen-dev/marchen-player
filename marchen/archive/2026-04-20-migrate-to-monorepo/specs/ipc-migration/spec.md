### 需求: 所有 renderer 端 tipcClient 调用 SHALL 迁移为带命名空间的 ipcClient 调用

#### 场景: app group 的方法调用
WHEN 原代码为 `tipcClient?.windowAction({ action: 'close' })`
THEN 迁移为 `ipcClient?.app.windowAction({ action: 'close' })`

#### 场景: player group 的方法调用
WHEN 原代码为 `tipcClient?.getAnimeDetailByPath({ path })`
THEN 迁移为 `ipcClient?.player.getAnimeDetailByPath({ path })`

#### 场景: setting group 的方法调用
WHEN 原代码为 `tipcClient?.setTheme(themes)`
THEN 迁移为 `ipcClient?.setting.setTheme(themes)`

#### 场景: utils group 的方法调用
WHEN 原代码为 `tipcClient?.getFilePathFromProtocolURL({ path })`
THEN 迁移为 `ipcClient?.utils.getFilePathFromProtocolURL({ path })`

### 需求: 所有 main 端 handler 定义 SHALL 迁移为 defineGroup 风格

#### 场景: route 对象迁移为 group
WHEN 原代码为 `export const appRoute = { windowAction: t.procedure.input<T>().action(fn) }`
THEN 迁移为 `export const appGroup = defineGroup('app', { windowAction: handler<T>().action(fn) })`

#### 场景: handler 内部业务逻辑不变
WHEN 迁移 handler 定义
THEN action 函数的 `{ context, input }` 参数签名和内部逻辑保持不变

### 需求: main 端事件发射 SHALL 迁移为 createEmitter API

#### 场景: getRendererHandlers 迁移为 createEmitter
WHEN 原代码为 `getRendererHandlers<RendererHandlers>(webContents)`
THEN 迁移为 `createEmitter<RendererHandlers>(webContents)`

#### 场景: 事件发送 API 保持一致
WHEN 原代码为 `handlers?.windowAction.send('enter-full-screen')`
THEN 迁移后 `emitter.windowAction.send('enter-full-screen')` 行为一致

### 需求: renderer 端事件监听 SHALL 迁移为 createListener API

#### 场景: createEventHandlers 迁移为 createListener
WHEN 原代码为 `createEventHandlers<RendererHandlers>({ on, send })`
THEN 迁移为 `createListener<RendererHandlers>({ on, send })`

#### 场景: 监听 API 保持一致
WHEN 原代码为 `handlers?.showSetting.listen(callback)`
THEN 迁移后行为一致，返回 unlisten 函数

### 需求: 所有跨模块 import SHALL 迁移为 workspace 包引用

#### 场景: renderer 不再引用 @main/ 路径
WHEN 迁移完成后检查 renderer 源码
THEN 不存在 `from '@main/'` 的 import 语句

#### 场景: main 不再引用 @renderer/ 路径
WHEN 迁移完成后检查 main 源码
THEN 不存在 `from '@renderer/'` 的 import 语句

### 需求: @egoist/tipc 依赖 SHALL 被完全移除

#### 场景: package.json 不包含 tipc
WHEN 检查根 package.json
THEN dependencies 和 devDependencies 中不包含 `@egoist/tipc`

#### 场景: 源码中无 tipc import
WHEN 搜索所有源文件
THEN 不存在 `from '@egoist/tipc'` 的 import 语句
