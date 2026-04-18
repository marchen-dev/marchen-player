## electron-ecosystem-upgrade

Electron 35→41、electron-vite 3→5、electron-builder 25→26、@electron/notarize 2→3 升级。

### 需求: electron-vite 5 的 externalizeDepsPlugin 移除 SHALL 被适配

electron-vite 5 内置了 `build.externalizeDeps`（默认启用），不再需要 `externalizeDepsPlugin` 插件。

#### 场景: electron.vite.config.ts 不再引用 externalizeDepsPlugin

WHEN 查看 electron.vite.config.ts
THEN 不包含 `externalizeDepsPlugin` 的 import 和使用
AND main/preload 的 plugins 数组中不包含该插件

#### 场景: Electron 开发服务器正常启动

WHEN 执行 `pnpm dev`
THEN Electron 窗口正常打开，主进程和渲染进程均正常加载

### 需求: electron-builder 26 的 hook 签名 SHALL 保持兼容

scripts/ 下的 3 个 hook（beforePack、afterPack、afterSign）的 PackContext 签名在 v26 中未变化。

#### 场景: 构建脚本无需修改

WHEN 执行 `pnpm build`
THEN 构建过程中 hook 脚本正常执行

### 需求: @electron/notarize v3 SHALL 保持 API 兼容

当前使用的 appleId/appleIdPassword/teamId 认证方式在 v3 中仍然支持。

#### 场景: notarize 脚本无需修改

WHEN 查看 scripts/notarize.js
THEN 现有的 notarize() 调用参数仍然有效
