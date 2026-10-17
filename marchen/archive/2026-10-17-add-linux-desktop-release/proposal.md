## 动机

有用户希望使用 Linux 桌面版。Linux 曾以 AppImage（x64 / arm64）发行，在 `329134c2`（Sparkle 原生更新 + 分渠道发布）中与 Intel Mac 一起被移除，当前发布链路只认 macOS ARM64 与 Windows x64，`verify-assets.mjs` 甚至把 Linux 产物视为错误。

现在重新纳入 Linux 并作为**官方支持平台**：需要和 macOS / Windows 一样具备可复现的 CI 构建、最终包校验、按渠道自动更新和验收证据，而不是一次性"能打包"的社区构建。

本地 AI（node-llama-cpp）改动已移至 `feat/local-ai-match-hint` 分支，不在本变更范围内。

## 变更内容

- **新增 Linux 发行产物**：AppImage 与 deb，架构 x64 与 arm64；x64 为正式支持，arm64 标注"实验性支持"（不承诺 Asahi 16K 页内核与低功耗设备的播放性能）。
- **自动更新**：AppImage 接入 `electron-updater`，与 Windows 共用渠道规则（稳定 / Beta / Alpha）；deb 不做应用内自动更新，检测到新版本时提示前往下载。
- **渠道源支持可选平台**：Linux 元数据缺失的历史版本不影响 macOS / Windows 渠道发布。
- **桌面集成修复**：
  - Linux 在应用已运行时通过文件管理器打开视频（`second-instance`）当前只在 Windows 注册，需要覆盖 Linux。
  - 非 Windows 平台叠加的透明拖拽层只适用于 macOS hiddenInset，Linux 原生标题栏下会吞掉顶部点击。
  - "在 Finder 中显示"等平台文案补齐 Linux。
  - 视频与 `.torrent` 文件关联（`.desktop` MIME 类型）。
- **硬件解码策略**：不恢复已删除的 `flag.ts` 强制 VA-API / ANGLE Vulkan 配置，默认使用 Chromium 默认行为并由 compat 内核兜底。
- **发布文档与口径**：`docs/desktop-release.md`、`CLAUDE.md`、发行说明、Linux 安装 FAQ（libfuse2、Ubuntu 24.04 sandbox）。
- **验收证据**：x64 通过 CI xvfb 冒烟 + 云虚拟机或用户 Alpha 实测；arm64 通过本机（Apple Silicon）虚拟机实测；GPU 硬解在证据中标注未验证。

## 能力

### 新增能力

- `linux-desktop-packaging`：Linux AppImage / deb 双格式、双架构的构建、文件关联、最终包校验与 CI 发行。
- `linux-desktop-update`：AppImage 自动更新、deb 更新提示，以及支持可选平台的渠道源发布。
- `linux-desktop-integration`：Linux 下的文件打开、窗口外观与拖拽、平台文案和视频解码策略。

### 修改能力

无（仓库当前没有主 specs；macOS / Windows 的既有发布与更新行为保持不变，仅渠道源改为容忍缺失的 Linux 元数据）。

## 影响范围

- **构建与发布**：`electron-builder.yml`、`scripts/desktop/*`（after-pack、verify-assets、channel-feeds、publish-channels，新增 Linux 最终包校验）、`.github/workflows/release.yml`、`update-channels.yml`、`package.json` 构建脚本。
- **共享策略**：`packages/shared/src/update-policy.ts`（Linux 更新源与元数据命名）。
- **主进程**：`src/main/lib/env.ts`、`src/main/lib/update.ts`、`src/main/initialize/index.ts`、`src/main/windows/main.ts`。
- **渲染进程**：`Prepare.tsx`、历史与影视库右键菜单文案、更新状态 UI（deb 下载提示）。
- **依赖**：无新增运行时依赖；原生依赖 `node-datachannel` 已核实有 linux-x64 / linux-arm64 预编译包（GLIBC ≥ 2.30），其余（bufferutil、utf-8-validate、utp-native、fs-native-extensions）为可选依赖，缺失时有 JS / 功能降级；utp-native 由 `install-app-deps` 在构建机上按目标架构从源码编译。
- **文档**：`docs/desktop-release.md`、`CLAUDE.md`、`docs/releases/<version>.md`、`docs/observability-runbook.md`（若新增 Linux 维度）。
- **CI 资源**：新增 `ubuntu-latest` 与 `ubuntu-24.04-arm` 两个构建 job，Release 多 4 个产物及 Linux 更新元数据。
