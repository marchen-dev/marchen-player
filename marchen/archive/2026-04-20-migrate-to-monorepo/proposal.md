## 动机

当前项目是单体结构，main 进程和 renderer 进程之间存在双向引用：

- renderer 引用 `@main/tipc`（Router 类型）、`@main/tipc/renderer-handlers`（RendererHandlers 类型）、`@main/constants/protocol`（协议常量）
- main 引用 `@renderer/lib/calc-file-hash`（文件哈希计算）

这导致两个 tsconfig 需要互相 include 对方的文件，依赖边界模糊。同时，IPC 通信依赖 `@egoist/tipc`，该库已停止维护（18 commits，无 release），存在长期风险。

迁移到 pnpm workspace monorepo 可以：
1. 将共享代码显式化为 package 依赖，消除 main/renderer 双向引用
2. 自封装 IPC 通信层，去除对 tipc 的依赖
3. 为未来扩展（新 app、新 package）打好基础

## 变更内容

- 引入 pnpm workspace，创建 `packages/` 目录
- 新建 `@marchen/electron-ipc` 包：自封装类型安全的 Electron IPC 通信，采用函数式 + 分组（defineGroup）风格
- 新建 `@marchen/shared` 包：存放 main/renderer 共享的常量、工具函数和类型
- 移除 `@egoist/tipc` 依赖
- 将所有 renderer 端的 `tipcClient?.method()` 调用迁移为 `ipcClient?.group.method()` 带命名空间的调用
- 清理 tsconfig，移除 renderer 对 main 源码的 include

## 能力

### 新增能力

- `electron-ipc-package`：自封装的 Electron IPC 通信包，提供 defineGroup/handler（main 端）和 createClient/createListener（renderer 端）
- `shared-package`：共享包，包含协议常量、文件哈希工具和 RendererHandlers 类型
- `workspace-setup`：pnpm workspace 配置和构建集成

### 修改能力

- `ipc-migration`：将现有 tipc 调用迁移到新 IPC 包，包括 main 端 handler 定义和 renderer 端调用

## 影响范围

- 新增 `pnpm-workspace.yaml`、`packages/electron-ipc/`、`packages/shared/`
- 修改 ~27 个源文件（import 路径和 API 调用）
- 修改 `package.json`（依赖变更）、`electron.vite.config.ts`、`vite.config.ts`（resolve alias）
- 修改 `tsconfig.node.json`、`tsconfig.web.json`（include/paths 调整）
- 修改 `electron-builder.yml`（排除 packages 目录）
- 删除 `src/main/tipc/_instance.ts`，移动 3 个文件到 shared 包
