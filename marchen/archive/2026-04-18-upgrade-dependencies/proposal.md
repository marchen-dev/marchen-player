## 动机

Marchen Player 已有约 1 年未维护，依赖版本严重滞后。128 个依赖中大部分有可用更新，其中多个核心依赖跨越了大版本（Tailwind 3→4、Vite 6→8、Electron 35→41、TypeScript 5→6）。

现在需要将项目依赖全量升级到最新版本，为后续的 Turborepo 架构迁移和功能开发打下基础。

## 变更内容

分 5 批升级所有依赖（排除 ffmpeg 相关和 ESLint）：

1. 安全升级：React、Jotai、TanStack Query、Radix UI、Framer Motion、Sentry、Zod 等 ~60 个依赖
2. TypeScript + tsconfig：TS 6.0、@electron-toolkit/tsconfig 2.0、@types/node 25
3. Electron 生态：Electron 41、electron-vite 5、electron-builder 26、@electron/notarize 3
4. Vite 8：Vite 8（Rolldown）、@vitejs/plugin-react 6，替换 rollup-plugin-copy
5. Tailwind 4 全家桶：Tailwind CSS 4、daisyui 5、tailwind-merge 3，重写配置文件

不升级的依赖：

- @ffmpeg-installer/ffmpeg、@ffprobe-installer/ffprobe、fluent-ffmpeg（后续有其他变动）
- @suemor/xgplayer（自维护 fork）
- eslint、eslint-config-hyoban（风险过高，单独处理）

## 能力

### 新增能力

- batch-safe-upgrade：安全批次依赖升级（React、Jotai、TanStack Query、Radix UI、Sentry 等）
- typescript-upgrade：TypeScript 6.0 + tsconfig 升级
- electron-ecosystem-upgrade：Electron 41 + electron-vite 5 + electron-builder 26 升级
- vite-rolldown-upgrade：Vite 8（Rolldown）升级及插件替换
- tailwind4-migration：Tailwind CSS 4 + daisyui 5 全量迁移

### 修改能力

无

## 影响范围

- `package.json`：~60 个依赖版本更新，1 个新增（vite-plugin-static-copy），1 个删除（rollup-plugin-copy）
- `electron.vite.config.ts`：删除 externalizeDepsPlugin，替换 copy 插件
- `vite.config.ts`：替换 copy 插件
- `src/renderer/src/components/layout/sidebar/index.tsx`：AlertCircle → CircleAlert
- `tailwind.config.ts`：删除（配置迁移到 CSS）
- `postcss.config.cjs`：删除
- `src/renderer/src/styles/tailwind.css`：重写为 Tailwind 4 语法
- `src/renderer/src/styles/tailwind-extend.css`：重写自定义工具类
- `src/renderer/src/styles/main.css`：调整 import 链
- `src/renderer/src/styles/shadcn.css`：可能需要微调
- `components.json`：更新或删除
- `pnpm-lock.yaml`：全量刷新
