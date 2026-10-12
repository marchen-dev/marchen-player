## 背景

延续 `upgrade-latest-dependency-stack` 的“最新优先、分批验证”基线，本变更为依赖升级批次 A：把所有补丁 / 次版本依赖升到最新（同步 `package.json` 范围，不只刷新 lockfile），并清理两处顺手问题——删除仓库中无任何引用的 `dotenv`；`@electron/asar` 升至纯 ESM 的 4.x，并把发版校验脚本从 `createRequire` 改为 `import`。

不在本批次：`@sentry/electron` 8 / `@sentry/react` 11（需对齐 `@sentry/core` 版本，批次 B）、`jotai` 3 与 `framer-motion` 14（待 spike，批次 C）、`vitest` 5（批次 D）。`@types/node` 保持 24.x，与 Node 24 运行时一致。

## 1. 依赖升级

- [x] 1.1 补丁版本：`@sentry/vite-plugin`、`@tanstack/react-virtual`、`@vitejs/plugin-react`、`dexie`、`nanoid`、`prettier`、`yaml`、`eslint-plugin-react-refresh`、`react-scan`
- [x] 1.2 运行时与构建链：`electron` 44.7、`vite` 8.3、`electron-vite` 6.0.0-beta.8
- [x] 1.3 媒体兼容内核：`mediabunny` / `@mediabunny/ac3` / `@mediabunny/dts` 1.61（三者同版本）
- [x] 1.4 UI 与数据层：`react` / `react-dom` / `@types/react` / `@types/react-dom` 19.3、`react-router`、`radix-ui`、`zod`、`posthog-js`、`@tanstack/react-query(-devtools)`、`tailwind-merge`、`lucide-react`
- [x] 1.5 开发工具：`eslint`、`@antfu/eslint-config`、`@eslint-react/eslint-plugin`、`lint-staged`、`simple-git-hooks`、`playwright-core`

## 2. 清理

- [x] 2.1 删除未使用的 `dotenv` 依赖
- [x] 2.2 `@electron/asar` 升至 4.x，`scripts/desktop/verify-mac.mjs` / `verify-windows.mjs` 改为 ESM `import`

## 3. 验证

- [x] 3.1 `pnpm typecheck` 与 `pnpm lint` 通过（新 lint 规则命中项修复而非关闭规则）
- [x] 3.2 `pnpm test:main`、`pnpm test:player-runtime` 与各 `packages/*` 测试通过
- [x] 3.3 `pnpm build` 与 `pnpm build:web` 通过
