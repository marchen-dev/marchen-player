## 背景

将 ESLint 配置从 `eslint-config-hyoban` 迁移到 `@antfu/eslint-config`。格式化继续由 Prettier 负责（`stylistic: false`），Tailwind 类名排序交给 `prettier-plugin-tailwindcss`。保留 antfu 的所有 opinionated 规则，不关闭。手动补充 `eslint-plugin-react-hooks`。

## 1. 依赖变更

- [x] 1.1 卸载 `eslint-config-hyoban`
- [x] 1.2 安装 `@antfu/eslint-config`、`eslint-plugin-react-hooks`、`prettier-plugin-tailwindcss`
- [x] 1.3 执行 `pnpm install` 确认依赖安装正常

## 2. 重写 eslint.config.mjs

- [x] 2.1 将 `defineConfig` (hyoban) 替换为 `antfu` 导入，配置 `stylistic: false`、`react: true`
- [x] 2.2 手动追加 `eslint-plugin-react-hooks` 的 recommended 规则
- [x] 2.3 迁移自定义规则：`unicorn/prefer-math-trunc: off`、`package-json/valid-name: off`、`no-restricted-globals` (location)
- [x] 2.4 删除 `tailwindcss` 相关的 settings 配置

## 3. 配置 Prettier Tailwind 插件

- [x] 3.1 在 `.prettierrc.mjs` 中添加 `prettier-plugin-tailwindcss` 插件

## 4. 全量修复与验证

- [x] 4.1 执行 `pnpm lint:fix` 全量自动修复
- [x] 4.2 执行 `pnpm format` 用 Prettier 格式化
- [x] 4.3 执行 `pnpm typecheck` 确认类型检查通过
- [x] 4.4 手动检查 lint 输出，处理无法自动修复的问题
