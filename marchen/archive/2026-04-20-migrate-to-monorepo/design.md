## 背景

项目当前是单体 Electron 应用，使用 electron-vite 构建。main 和 renderer 通过 tsconfig paths alias（`@main/*`、`@renderer/*`）互相引用源码，导致：

- `tsconfig.node.json` include 了 `src/renderer/src/lib/calc-file-hash.ts`
- `tsconfig.web.json` include 了 `src/main/lib/*`、`src/main/tipc/**/*`、`src/main/constants` 等
- `electron.vite.config.ts` 和 `vite.config.ts` 都配置了 `@main` 和 `@renderer` 双向 alias

IPC 通信使用 `@egoist/tipc@0.3.2`，运行时代码约 60 行，提供：
- `tipc.create()` + `t.procedure.input<T>().action(fn)` 定义 handler
- `registerIpcMain(router)` 注册到 ipcMain
- `createClient<Router>(ipcInvoke)` 创建 renderer 端 proxy
- `getRendererHandlers<T>(webContents)` 创建 main→renderer 事件发射
- `createEventHandlers<T>({ on, send })` 创建 renderer 端事件监听

## 目标与非目标

**目标：**
- 建立 pnpm workspace monorepo，将共享代码提取为独立包
- 自封装 IPC 通信层，替换 `@egoist/tipc`，采用函数式 + 分组风格
- 消除 main/renderer 之间的直接源码引用
- 清理 tsconfig，使每个 tsconfig 只 include 自己进程的代码

**非目标：**
- 不改变 IPC handler 的业务逻辑
- 不改变 electron-vite 的构建流程（只调整 resolve alias）
- 不拆分应用为多个 app（保持单 app 结构）
- 不引入构建步骤给 workspace 包（直接引用 TypeScript 源码）

## 决策

### D1: workspace 包直接引用源码，不预编译

workspace 包的 package.json exports 直接指向 `.ts` 源文件。electron-vite 和 vite 在构建时会通过 resolve alias 或 tsconfig paths 解析到源码并一起编译。

理由：项目只有一个消费者（主应用），预编译增加复杂度但无收益。electron-vite 天然支持 TypeScript 源码解析。

### D2: IPC channel 命名规则为 `{groupName}:{methodName}`

例如 `app:windowAction`、`player:grabFrame`。这与 tipc 的扁平命名（直接用方法名）不同。

理由：分组后避免不同 group 的方法名冲突，同时在 DevTools 中更容易识别 IPC 调用来源。

### D3: 事件 channel 不加 group 前缀

main→renderer 的事件（如 `windowAction`、`showSetting`）保持扁平命名，不加 group 前缀。

理由：事件由 `RendererHandlers` 接口统一定义，数量少（5 个），不存在命名冲突风险。保持与现有行为一致，减少迁移改动。

### D4: renderer 端 client 变量命名为 `ipcClient`

从 `tipcClient` 改为 `ipcClient`，保持 `?.` 可选链模式（Web 环境下为 null）。

### D5: `@marchen/shared` 使用细粒度 exports

```
"exports": {
  "./constants/protocol": "./src/constants/protocol.ts",
  "./lib/calc-file-hash": "./src/lib/calc-file-hash.ts",
  "./types/renderer-handlers": "./src/types/renderer-handlers.ts"
}
```

理由：避免 renderer 构建时引入不需要的模块。每个 export 路径对应一个具体功能。

### D6: `spark-md5` 保留在根 package.json

`calc-file-hash.ts` 移到 `@marchen/shared` 后，`spark-md5` 依赖保留在根 `package.json`。workspace 包通过 pnpm 的依赖提升机制解析。

理由：项目只有一个 lockfile，依赖统一管理更简单。shared 包的 package.json 中声明 `spark-md5` 为 dependency 用于语义正确性，但实际安装由根管理。

### D7: 目录重命名 `src/main/tipc/` → 保持不变

虽然 `tipc` 名称不再准确，但重命名为 `ipc/` 会增加 git diff 噪音。保持现有目录名，内部文件内容迁移即可。

理由：目录名是内部实现细节，不影响外部 API。可以在后续清理中单独处理。

### D8: `TipcListener.tsx` 重命名为 `IpcListener.tsx`

这是 renderer 端的组件文件，直接面向开发者。重命名使命名与新 API 一致。

### D9: electron-vite resolve alias 策略

保留 `@main` 和 `@renderer` alias（main 内部和 renderer 内部仍然需要）。不需要为 `@marchen/*` 添加 alias，因为 pnpm workspace 的 symlink 机制会自动解析。

但需要确保 electron-vite 能正确解析 workspace 包中的 `.ts` 文件。如果默认不支持，需要在 `optimizeDeps.include` 或 `ssr.noExternal` 中配置。

## 风险与权衡

### R1: electron-vite 对 workspace 包源码的解析

electron-vite 底层是 vite，默认会将 `node_modules` 中的包视为外部依赖（main 进程）或预构建（renderer 进程）。workspace 包通过 symlink 链接到 `node_modules/@marchen/*`，可能需要额外配置才能正确处理 `.ts` 源文件。

缓解：如果遇到问题，可以在 electron-vite 配置中将 `@marchen/*` 加入 `ssr.noExternal`（main）或 `optimizeDeps.exclude`（renderer），或者直接用 tsconfig paths 映射到源码路径而不走 node_modules。

### R2: 大量机械替换可能引入拼写错误

约 33 处 `tipcClient?.method()` 调用需要改为 `ipcClient?.group.method()`，每处都需要正确映射到对应的 group。

缓解：TypeScript 类型检查会捕获所有映射错误。迁移后运行 `tsc --noEmit` 验证。

### R3: Web 版构建的兼容性

项目支持 Web 版（通过 `vite.config.ts` 构建）。`@marchen/electron-ipc/renderer` 不依赖 electron，但 `createClient` 需要 `ipcInvoke` 参数，Web 环境下为 null。现有的 `window.electron` 判断逻辑保持不变。

### R4: electron-builder 打包

`packages/` 目录的源码会被 electron-vite bundle 进产物，不需要打包进 asar。需要在 `electron-builder.yml` 的 files 排除规则中添加 `!packages/*`。
