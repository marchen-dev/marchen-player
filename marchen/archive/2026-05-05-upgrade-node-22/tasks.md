## 背景

CI 的 build.yml 使用 Node 18.x，但 ESLint 10.x 依赖 RegExp v flag（需要 Node 20+），导致 lint 阶段报 `SyntaxError: Invalid regular expression flags`。Node 18 已 EOL，统一所有 workflow 到 Node 22.x，并修复 build.yml 中 `npm run lint` 应为 `pnpm run lint` 的不一致。

## 1. 升级 workflow Node 版本

- [x] 1.1 build.yml: node-version 从 18.x 改为 22.x
- [x] 1.2 deploy.yml: node-version 从 20.x 改为 22.x
- [x] 1.3 release.yml: node-version 从 20.x 改为 22.x

## 2. 修复 build.yml 命令不一致

- [x] 2.1 build.yml: `npm run lint` 改为 `pnpm run lint`
