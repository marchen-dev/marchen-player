## 背景

Marchen Player 是 Electron + React 双目标项目（Desktop + Web），1 年未维护。当前依赖版本严重滞后，多个核心依赖跨越大版本。项目能正常启动，Node.js v22.20.0，pnpm 10.11.0。

当前构建工具链：

- electron-vite 3（管理 main/preload/renderer 三层构建）
- vite 6（Web 独立构建）
- Tailwind CSS 3 + daisyui 4（JS 配置文件模式）
- TypeScript 5.5（两套 tsconfig，extends @electron-toolkit/tsconfig）

## 目标与非目标

**目标：**

- 所有目标依赖升级到最新版本
- 升级后 `pnpm dev`（Desktop）和 `pnpm dev:web`（Web）均能正常启动
- 升级后 `pnpm typecheck` 通过
- 升级后 `pnpm build` 能正常构建

**非目标：**

- 不做 Turborepo 架构迁移（后续单独变更）
- 不升级 ffmpeg 相关依赖（后续有其他变动）
- 不升级 ESLint 生态（风险过高，单独处理）
- 不升级 @suemor/xgplayer（自维护 fork）
- 不做功能变更或代码重构

## 决策

### 一次性升级 package.json，分批修复问题

所有依赖版本在 package.json 中一次性更新，然后 `pnpm install` 刷新 lockfile。之后按批次顺序修复不兼容的代码。

理由：避免多次 lockfile 刷新导致的中间状态不一致。pnpm 的依赖解析足够可靠，一次性升级比逐批升级更高效。

### rollup-plugin-copy → vite-plugin-static-copy

Vite 8 用 Rolldown 替换了 Rollup。虽然 Rolldown 兼容大部分 Rollup 插件，但 vite-plugin-static-copy 是 Vite 原生方案，同时支持 dev 和 build 模式，更可靠。

### Tailwind 4 配置迁移策略

将 tailwind.config.ts 的 107 行 JS 配置迁移到 CSS @theme 指令。具体策略：

- tailwind.css 作为主入口，包含 `@import "tailwindcss"` + `@theme { ... }` + 插件配置
- shadcn.css 的 CSS 变量定义保持原样（Tailwind 4 兼容 @layer base）
- tailwind-extend.css 的 `@layer components` 改为 `@utility`
- daisyui 5 通过 `@plugin "daisyui"` 引入
- @iconify/tailwind 通过 `@plugin "@iconify/tailwind"` 引入

### 不修改 cssAsPlugin.js

根目录的 `cssAsPlugin.js` 被 tailwind.config.ts 通过 `import './cssAsPlugin'` 引入。Tailwind 4 迁移后 tailwind.config.ts 被删除，cssAsPlugin.js 也不再需要，可以一并删除。

## 风险与权衡

### 已知风险

| 风险                                        | 影响         | 缓解措施                                   |
| ------------------------------------------- | ------------ | ------------------------------------------ |
| tailwindcss-animate 可能不兼容 Tailwind 4   | 动画类失效   | 检查兼容性，必要时用 CSS @keyframes 替代   |
| daisyui 5 主题配置方式变化                  | 主题样式异常 | 参考 daisyui 5 文档重新配置 cmyk/dark 主题 |
| @electron-toolkit/tsconfig 2.0 基础配置变化 | 编译错误     | typecheck 验证，必要时调整 tsconfig 覆盖项 |
| Vite 8 Rolldown 对某些 Rollup 插件不兼容    | 构建失败     | 已决定替换 rollup-plugin-copy              |

### 权衡

- 一次性升级 vs 逐批升级：选择一次性升级 package.json，牺牲了问题定位的精确性，换取了更快的整体速度和更干净的 lockfile
- Tailwind 4 配置重写工作量大，但这是不可避免的（Tailwind 3 的 JS 配置模式在 v4 中已废弃）
