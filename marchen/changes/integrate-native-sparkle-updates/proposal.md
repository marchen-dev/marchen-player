## 动机

Apple 开发者会员到期后，Marchen 需要在不依赖 Developer ID、公证的前提下继续分发 macOS 客户端，并为新安装用户提供后续自动更新。现有 electron-updater 在 macOS 使用 Squirrel.Mac，不能直接接续到 ad-hoc 新包；当前检查、下载、安装状态也分散在主进程与界面中。

用户已确认采用仓库内最小原生桥接、官方 Sparkle 和中文原生更新窗口，仅发布 macOS ARM64 与 Windows x64，停止 Linux 客户端及 Mac Intel 发包。优先证明真实安装更新可行，再完成正式集成。

## 变更内容

- 在 packages/sparkle-updater 建立 Marchen 专用桥接，使用锁定的官方 Sparkle，不依赖 Innei 桥接的静默驱动或多跳差分补丁。
- macOS 使用标准原生 UI，支持系统语言下的简繁中文、手动检查和官方自动检查授权；下载、验签、安装交给 Sparkle。
- 安装前确认播放进度已保存，协调 Electron 的退出与重启；桥接不可用时提供下载页入口，不回退到不可用的 macOS Squirrel 更新。
- Windows 保留 electron-updater，整理检查/下载/准备/安装/错误状态、快照与订阅，明确用户确认安装，不在退出时默认安装。
- 发布流水线补齐媒体资源准备、原生模块打包、ad-hoc 签名、Ed25519 签名与 appcast、官方直接差分和最终包检查；保留统一发布协调。
- 删除 Linux 与 Mac x64 发布目标、Linux 专属无用代码，更新支持范围、首次安装与手动迁移文档。
- 第一项工程门槛为隔离的 ARM64 A → B 全量更新及中文窗口验证；后续覆盖正式播放器退出保存和直接差分。

- 增加自动 stable/Beta/Alpha 三渠道，支持预发布版本晋升及禁止降级；Draft 经人工公开后原子更新固定渠道入口。

## 能力

### 新增能力

- `native-sparkle-updates`：ARM64 原生桥接、中文标准窗口、更新真实性验证与降级。
- `desktop-update-lifecycle`：按平台路由更新、播放保存与安装协调、Windows 状态和更新反馈。
- `desktop-release-delivery`：目标平台、完整打包、签名及版本源、差分发布与旧版迁移。

### 修改能力

以上能力集中描述现有桌面更新与发布行为的替换，不修改播放器解码、Web 发布或媒体导入能力。

## 影响范围

涉及 packages/sparkle-updater、主进程更新服务/启动/退出/IPC、Preload 与共享契约、设置关于页和 Windows 更新提示、播放历史保存边界、electron-builder.yml、package.json、pnpm 锁文件、release/build workflow、发布脚本及文档。

不自研安装器/补丁算法，不做通用 npm 库，不引入 Sparkle 多跳补丁，不恢复 Linux 或 Mac Intel 支持。旧客户端首次手动迁移、Gatekeeper 首次打开限制明确保留；本变更不自动发布测试包到正式更新源、不自动删除远端旧产物。
