## vite-rolldown-upgrade

Vite 6→8（Rolldown 替换 Rollup）、@vitejs/plugin-react 4→6 升级，替换不兼容的 Rollup 插件。

### 需求: rollup-plugin-copy SHALL 被替换为 vite-plugin-static-copy

Vite 8 用 Rolldown 替换了 Rollup，rollup-plugin-copy 不再推荐使用。需要在 electron.vite.config.ts 和 vite.config.ts 中替换为 vite-plugin-static-copy。

复制目标：`node_modules/@jellyfin/libass-wasm/dist/js/subtitles-octopus-worker.wasm` → 对应的 output assets 目录。

#### 场景: electron.vite.config.ts 使用 vite-plugin-static-copy

WHEN 查看 electron.vite.config.ts
THEN renderer 配置中使用 vite-plugin-static-copy 替代 rollup-plugin-copy
AND WASM 文件被正确复制到 out/renderer/assets

#### 场景: vite.config.ts 使用 vite-plugin-static-copy

WHEN 查看 vite.config.ts
THEN 使用 vite-plugin-static-copy 替代 rollup-plugin-copy
AND WASM 文件被正确复制到 out/web/assets

#### 场景: Web 构建产物包含 WASM 文件

WHEN 执行 `pnpm build:web`
THEN `out/web/assets/subtitles-octopus-worker.wasm` 文件存在

### 需求: rollup-plugin-copy SHALL 从依赖中移除

#### 场景: package.json 不再包含 rollup-plugin-copy

WHEN 查看 package.json
THEN devDependencies 中不包含 rollup-plugin-copy
AND devDependencies 中包含 vite-plugin-static-copy
