## 1. 一次性升级 package.json 中的所有目标依赖

- [x] 1.1 更新 package.json 中所有目标依赖的版本号（排除 ffmpeg 相关、@suemor/xgplayer、eslint 相关）
- [x] 1.2 移除 rollup-plugin-copy，新增 vite-plugin-static-copy
- [x] 1.3 执行 `pnpm install` 刷新 lockfile

## 2. 适配 lucide-react v1 的 icon 重命名

- [x] 2.1 在 `src/renderer/src/components/layout/sidebar/index.tsx` 中将 `AlertCircle` 改为 `CircleAlert`

## 3. 适配 electron-vite 5

- [x] 3.1 在 `electron.vite.config.ts` 中删除 `externalizeDepsPlugin` 的 import 和使用（main 和 preload 的 plugins 数组）

## 4. 适配 Vite 8：替换 copy 插件

- [x] 4.1 在 `electron.vite.config.ts` 中将 rollup-plugin-copy 替换为 vite-plugin-static-copy（renderer 配置）
- [x] 4.2 在 `vite.config.ts` 中将 rollup-plugin-copy 替换为 vite-plugin-static-copy

## 5. Tailwind 4 迁移：重写配置文件

- [x] 5.1 重写 `src/renderer/src/styles/tailwind.css`：替换 `@tailwind` 指令为 `@import "tailwindcss"`，添加 `@theme { ... }` 块（迁移 tailwind.config.ts 中的颜色、字体、断点、圆角、动画配置）
- [x] 5.2 配置 daisyui 5 和 @iconify/tailwind 插件（通过 `@plugin` 指令）
- [x] 5.3 重写 `src/renderer/src/styles/tailwind-extend.css`：将 `@layer components` 改为 `@utility` 语法
- [x] 5.4 调整 `src/renderer/src/styles/main.css` 的 import 链顺序
- [x] 5.5 检查并调整 `src/renderer/src/styles/shadcn.css`（确认 @layer base 在 Tailwind 4 下正常工作）
- [x] 5.6 删除 `tailwind.config.ts`
- [x] 5.7 删除 `postcss.config.cjs`
- [x] 5.8 删除 `cssAsPlugin.js`
- [x] 5.9 更新或删除 `components.json`

## 6. 验证

- [x] 6.1 执行 `pnpm typecheck` 确认类型检查通过
- [ ] 6.2 执行 `pnpm dev` 确认 Desktop 开发服务器正常启动
- [ ] 6.3 执行 `pnpm dev:web` 确认 Web 开发服务器正常启动
- [x] 6.4 执行 `pnpm build:web` 确认 Web 构建正常，WASM 文件存在于 out/web/assets
