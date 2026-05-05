### 需求: Router 类型 SHALL 通过 typeof 从实现代码推导，支持 Go to Definition 跳转

`Router` 类型定义为 `typeof router`，其中 `router` 是包含所有 group 的具体对象。TypeScript 的类型链从 renderer 端的调用一路追踪到 main 端的 handler 属性定义。

#### 场景: Go to Definition 跳转到 handler 实现

WHEN 在 renderer 端对 `ipcClient?.setting.getWindowIsFullScreen()` 执行 "Go to Definition"
THEN IDE 跳转到 `src/main/ipc/setting.ts` 中 `getWindowIsFullScreen` 属性的定义位置

#### 场景: 类型链完整可追踪

WHEN TypeScript 解析 `ipcClient.setting.getWindowIsFullScreen` 的类型
THEN 类型链为：`ClientFromRouter<Router>` → `typeof router` → `typeof settingGroup` → handler 属性
AND 链中每一步都是具体的 typeof 引用，不经过 module augmentation 或空接口

#### 场景: renderer 通过 type-only import 获取 Router 类型

WHEN renderer 端使用 `import type { Router } from '@main/ipc'`
THEN 仅引入类型信息，不产生运行时依赖
AND Web 构建产物中不包含 main 进程的任何代码
