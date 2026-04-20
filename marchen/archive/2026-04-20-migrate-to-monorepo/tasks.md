## 1. Workspace 基础设施

- [x] 1.1 创建 `pnpm-workspace.yaml`，配置 `packages: ["packages/*"]`
- [x] 1.2 创建 `packages/electron-ipc/package.json` 和 `packages/electron-ipc/tsconfig.json`
- [x] 1.3 创建 `packages/shared/package.json` 和 `packages/shared/tsconfig.json`
- [x] 1.4 根 `package.json` 添加 `@marchen/electron-ipc: "workspace:*"` 和 `@marchen/shared: "workspace:*"` 依赖，移除 `@egoist/tipc`

## 2. @marchen/electron-ipc 包实现

- [x] 2.1 实现 `packages/electron-ipc/src/types.ts`：IpcContext、MergeGroups 等类型工具
- [x] 2.2 实现 `packages/electron-ipc/src/main.ts`：handler、defineGroup、registerIpc、createEmitter
- [x] 2.3 实现 `packages/electron-ipc/src/renderer.ts`：createClient、createListener

## 3. @marchen/shared 包实现

- [x] 3.1 移动 `src/main/constants/protocol.ts` → `packages/shared/src/constants/protocol.ts`
- [x] 3.2 移动 `src/renderer/src/lib/calc-file-hash.ts` → `packages/shared/src/lib/calc-file-hash.ts`
- [x] 3.3 移动 `src/main/tipc/renderer-handlers.ts` → `packages/shared/src/types/renderer-handlers.ts`

## 4. Main 进程迁移

- [x] 4.1 迁移 `src/main/tipc/app.ts`：换 import + defineGroup('app')
- [x] 4.2 迁移 `src/main/tipc/player.ts`：换 import + defineGroup('player') + 更新 protocol 和 calc-file-hash 引用
- [x] 4.3 迁移 `src/main/tipc/setting.ts`：换 import + defineGroup('setting')
- [x] 4.4 迁移 `src/main/tipc/utils.ts`：换 import + defineGroup('utils')
- [x] 4.5 重写 `src/main/tipc/index.ts`：导出 groups 和 IpcRouter 类型，删除 `_instance.ts`
- [x] 4.6 迁移 `src/main/initialize/index.ts`：registerIpcMain → registerIpc + 更新 protocol 引用
- [x] 4.7 迁移 `src/main/windows/setting.ts`：用 createEmitter 替换 getRendererHandlers + 更新 RendererHandlers 引用
- [x] 4.8 迁移 `src/main/index.ts`：更新 protocol 引用
- [x] 4.9 迁移 `src/main/lib/protocols.ts`：更新 protocol 引用

## 5. Renderer 进程迁移

- [x] 5.1 重写 `src/renderer/src/lib/client.ts`：用新 createClient 和 createListener API
- [x] 5.2 重命名 `TipcListener.tsx` → `IpcListener.tsx` + 更新 `App.tsx` 引用
- [x] 5.3 迁移 renderer 端 protocol 引用：`loading/hooks.ts` 和 `subtitle/hooks.ts` 的 `@main/constants` → `@marchen/shared`
- [x] 5.4 迁移 renderer 端 calc-file-hash 引用：`loading/hooks.ts` 的 `@renderer/lib/calc-file-hash` → `@marchen/shared`
- [x] 5.5 批量替换 `tipcClient` → `ipcClient` + 加 group 前缀（13 个文件，~33 处调用）

## 6. 配置文件更新

- [x] 6.1 更新 `tsconfig.node.json`：移除 `src/renderer/src/lib/calc-file-hash.ts` include，添加 packages paths
- [x] 6.2 更新 `tsconfig.web.json`：移除所有 `src/main/` include，添加 packages paths
- [x] 6.3 更新 `electron.vite.config.ts`：移除 renderer 配置中的 `@main` alias，确认 workspace 包解析正常
- [x] 6.4 更新 `vite.config.ts`：移除 `@main` alias
- [x] 6.5 更新 `electron-builder.yml`：files 排除规则添加 `!packages/*`

## 7. 验证

- [x] 7.1 运行 `pnpm install` 确认 workspace 包正确链接
- [x] 7.2 运行 TypeScript 类型检查，确认无类型错误
- [x] 7.3 运行 `electron-vite build` 确认构建成功
- [ ] 7.4 启动开发服务器，验证 IPC 通信正常工作（窗口操作、主题切换、文件导入等）— 需手动测试
- [x] 7.5 确认源码中不存在 `@egoist/tipc`、`from '@main/'`（renderer 中）、`from '@renderer/'`（main 中）的引用
  - `@egoist/tipc` 引用已全部移除 ✓
  - renderer 中仅保留一处 `import type { IpcRouter } from '@main/tipc'`（type-only，编译时擦除，构建已验证通过）
  - main 中无 `@renderer/` 引用 ✓
