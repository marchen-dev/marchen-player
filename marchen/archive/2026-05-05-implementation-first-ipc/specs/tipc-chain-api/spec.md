### 需求: 链式 API SHALL 提供 procedure 构建器，支持可选 input 类型声明和 action 定义

`t.procedure` 返回链式构建器，支持两种调用方式：
- `t.procedure.action(fn)` — 无输入参数的 handler
- `t.procedure.input<T>().action(fn)` — 带类型化输入参数的 handler

每个 action 函数接收 `{ context, input }` 参数，返回 Promise。

#### 场景: 定义无输入参数的 handler

WHEN 使用 `t.procedure.action(async ({ context }) => { ... })` 定义 handler
THEN 生成的 handler 对象包含 `action` 属性
AND action 函数的 input 类型为 `void`
AND renderer 端调用时不需要传参数

#### 场景: 定义带输入参数的 handler

WHEN 使用 `t.procedure.input<{ path: string }>().action(async ({ input }) => { ... })` 定义 handler
THEN 生成的 handler 对象包含 `action` 属性
AND action 函数的 input 类型为 `{ path: string }`
AND renderer 端调用时必须传入匹配类型的参数

#### 场景: context 提供 sender 信息

WHEN handler 的 action 函数被调用时
THEN `context.sender` 为发起调用的 renderer 进程的 `WebContents` 引用

---

### 需求: handler 对象 SHALL 以普通对象形式组织为 group

handler 通过普通 JavaScript 对象组织为 group，不需要额外的 `defineGroup` 包装函数。

#### 场景: 定义一个 group

WHEN 开发者编写 `export const settingGroup = { getWindowIsFullScreen: t.procedure.action(...), setTheme: t.procedure.input<AppTheme>().action(...) }`
THEN TypeScript 能通过 `typeof settingGroup` 推导出完整的 handler 类型信息
AND 每个属性的类型包含 input 和 output 的泛型参数

#### 场景: 组合多个 group 为 router

WHEN 开发者编写 `export const router = { setting: settingGroup, player: playerGroup }`
THEN `typeof router` 包含所有 group 及其 handler 的完整类型信息
AND 可作为 `createClient` 和 `registerIpc` 的类型参数
