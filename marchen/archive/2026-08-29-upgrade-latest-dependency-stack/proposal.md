## 动机

Marchen 的 UI 重构已连续完成 Radix 基础设施统一、影视库改版、Sidebar / AppHeader 重构和 DetailOverlay 调整，下一步还将继续推进 Tailwind 样式统一及播放器界面重构。当前依赖栈横跨多个已发布的新 major，且存在 `electron-vite@5` 与 Vite 8 的 peer 范围不一致；继续在旧基线或未声明支持的组合上开发，会把依赖迁移风险叠加到后续 UI 工作中。

本变更在继续 UI 重构前建立“最新优先”的统一技术基线：允许采用已经明确声明支持 Vite 8 的 `electron-vite@6` beta，按可独立验证的批次升级运行时、构建链、UI 基础依赖和开发工具，并在每批升级后证明 Electron / Web 双端仍可构建和运行。

## 变更内容

1. 将本地与 CI 工具链升级到 Node 24 LTS、pnpm 11，并同步 package manager 声明、CI workflow 与 Node 类型基线。
2. 将 Electron 升级到 44，配套升级 electron-builder、electron-updater、electron-log 等桌面运行与发布依赖，接受最低 macOS 版本提升到 macOS 13。
3. 将构建链升级到 `electron-vite@6.0.0-beta.1`、Vite 8、Vite React Plugin 6 和 TypeScript 7，消除当前 electron-vite 5 与 Vite 8 的 peer 范围不一致。
4. 将 UI 基础栈升级到 React 19 最新补丁、React Router 8、Framer Motion 13、Radix UI 最新版、Tailwind CSS 4 最新版，并完成必要的 API 与导入迁移。
5. 将 AI SDK、Provider、Vitest、ESLint 配置、格式化工具、数据层和其他直接依赖升级到最新可用版本；对已废弃且不存在升级版本的 `fluent-ffmpeg` 只登记后续替换任务，不在本变更中扩张为播放架构改造。
6. 按工具链、Electron、构建链、UI、应用依赖分批升级和验证，禁止一次性更新后集中修错；保留现有播放器、弹幕、IPC、数据库和 Web/Electron 产品行为。

## 能力

### 新增能力

- `latest-version-policy`：定义“最新优先”的版本选择、beta 接受条件、锁定方式和异常回退规则。
- `modern-toolchain`：统一 Node、pnpm、Vite、electron-vite、TypeScript 与 CI 的现代构建基线。
- `electron-44-runtime`：升级并验证 Electron 44 桌面运行、打包、协议、文件导入和更新能力。
- `modern-ui-foundation`：升级 React、React Router、Motion、Radix 与 Tailwind，并维持现有 UI 行为和主题表现。
- `dependency-upgrade-verification`：为每批依赖升级规定类型检查、测试、构建、Electron 实机、UI 和媒体回归门槛。

### 修改能力

- `ai-provider-client`：将 AI SDK 与 OpenAI / Anthropic Provider 升级到新 major，同时保持现有 Provider 配置和模型客户端创建语义。
- `player-core-tests`：升级 Vitest 并保持 player-core 状态机、pipeline 和 service 测试行为不变。

## 影响范围

- 依赖与锁文件：`package.json`、`pnpm-lock.yaml`、workspace 子包 manifests。
- 工具链与 CI：GitHub workflows、TypeScript 配置、Vite / electron-vite 配置、ESLint / Prettier 配置。
- Electron：`src/main/`、`src/preload/`、自定义协议、窗口与 IPC 初始化、`electron-builder.yml` 和打包脚本。
- Renderer：路由入口、Motion 动画、Radix 封装、Tailwind 主题、AI Provider 客户端及相关类型适配。
- 验证面：Electron 与 Web 开发/生产构建、player-core 测试、亮暗主题、核心播放与字幕场景。

本变更不重新设计 UI，不实施 mpv/libmpv/VLC/GStreamer，不新增 FFmpeg 播放转码，也不改变弹弹play API、数据库 schema 或播放器状态机业务语义。现有 `tailwind-unify-library-sidebar` 变更在本变更验收完成后继续实施。
