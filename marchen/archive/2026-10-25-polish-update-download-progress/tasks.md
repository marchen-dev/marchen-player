## 背景

Windows / Linux AppImage 的应用内更新进度只在「关于 → 软件更新」展示，目前用的是未加样式的原生 `<progress>`，在 Windows 上显示为系统默认样式，深色模式下也不跟随主题，与下载页、远程读取进度条风格不一致；同时只显示进度条，没有百分比、大小和速度。

方案：主进程把 electron-updater `download-progress` 事件中已有的 transferred / total / bytesPerSecond 一并转发到 `DesktopUpdateState`；关于页改用与下载页一致的细圆角进度条，下方显示「已下载 / 总大小 · 百分比」和「速度 · 剩余时间」；100% 后的 preparing 阶段保留满条并加脉冲动画，避免看起来像卡住。不加任务栏进度，也不改关于页以外的入口。

## 1. 主进程进度数据

- [x] 1.1 `DesktopUpdateState` 增加可选的 `transferred`、`total`、`bytesPerSecond` 字段并注释含义
- [x] 1.2 `update.ts` 的 `download-progress` 转发这三项；开始下载、已是最新时清空，避免残留旧数值
- [x] 1.3 补充 `update.test.ts` 断言进度字段被转发

## 2. 关于页进度条

- [x] 2.1 用 `role="progressbar"` 细条替换原生 `<progress>`，样式与下载页一致，preparing 阶段显示满条脉冲
- [x] 2.2 进度条下方显示大小、百分比、速度与剩余时间，复用 `formatBytes`

## 3. 验证

- [x] 3.1 `pnpm typecheck`、`pnpm lint`、`pnpm test:main` 通过
