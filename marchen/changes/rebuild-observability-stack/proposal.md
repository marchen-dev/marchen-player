## 动机

Marchen 当前只有 Renderer 中的局部 Sentry 初始化，Main 与 Preload 没有实际接入，发布产物也没有 release、dist、Debug ID 和 Source Map 上传，因此生产错误仍然只能定位到压缩后的 bundle。现有 React 错误入口与 `console.error` 捕获还会重复上报或产生不准确的 handled 分类。

项目正在重构原生播放器并新增 FFmpeg、Media Gateway 与兼容转码链路。仅依赖自动错误捕获无法回答用户量、留存、功能使用率、播放计划、兼容回退和首帧性能等产品与播放器问题；若直接对 HTTP、弹幕 DOM 和 HLS 分片做无差别全量采集，又会形成高频噪声、额度浪费和不可检索的数据。因此需要以 Sentry + PostHog 重建统一的可观测体系，在 Electron 与 Web 桌面端同时建立稳定、可关联、可发布验证的遥测边界。

## 变更内容

- 使用官方 Electron/React SDK 重新接入 Sentry，覆盖 Electron Main、Preload、Renderer 与 Web Renderer，包括 JavaScript 错误、原生崩溃、结构化日志、性能追踪和错误关联回放。
- 接入 PostHog 产品分析，统一采集活跃安装、会话、留存、页面访问、核心功能使用、播放漏斗、Feature Flag 与常规 Session Replay；PostHog 不重复承担错误追踪。
- 建立跨端遥测门面、稳定匿名安装身份、应用会话与播放会话关联字段，以及类型安全的业务事件契约，避免组件和纯领域包直接依赖厂商 SDK。
- 为播放器加载、播放计划、FFmpeg 兼容回退、首帧、seek、卡顿和播放结束建立摘要级遥测；不把逐个 HLS 分片、持续弹幕 DOM mutation 等高频内部实现当作独立业务事件。
- 修复 React root、路由错误页和 console 捕获之间的重复上报，统一错误归类、错误码、fingerprint、breadcrumb 与上下文。
- 建立 release、commit、environment、target、runtime、platform、arch 和 dist 元数据，在 Electron/Web 构建中生成隐藏 Source Map、注入 Debug ID，并由 CI 在发布前上传到 Sentry。
- 将 PostHog 项目 Token/Host 与 Sentry 构建配置纳入环境类型、示例配置和 Electron/Web 发布流程；本地开发默认不污染生产数据，但提供显式诊断开关用于验收。
- 默认不遮蔽普通界面文本和业务诊断内容，以尽可能保留问题上下文；认证凭据、AI API Key、Media Gateway bearer token 等可直接授予访问权限的秘密不得进入遥测。回放对视频画面、弹幕运动层、字幕高频层和时间轴更新做性能隔离，由结构化事件补充对应状态。

## 能力

### 新增能力

- `cross-runtime-error-observability`：覆盖 Electron Main、Preload、Renderer 与 Web 的统一错误、日志、性能追踪、原生崩溃和错误回放。
- `product-analytics-and-identity`：使用 PostHog 提供稳定匿名身份、DAU/MAU、留存、页面/功能漏斗、Session Replay、Feature Flag 与实验能力。
- `playback-telemetry`：以稳定播放会话和状态转换采集加载、播放计划、兼容回退、首帧、seek、卡顿、功能使用与结束结果。
- `release-diagnostics`：为 Electron/Web 发布产物建立统一 release、分平台 dist、Debug ID、Source Map 上传及发布验证。

### 修改能力

- 无。现有播放器、影视库、设置和 FFmpeg 行为不改变；本变更只观察既有行为并为后续 Feature Flag 提供非关键 UI 开关能力。

## 影响范围

- Electron Main/Preload：应用入口、崩溃捕获、FFmpeg/Media Gateway 生命周期、IPC 与结构化日志。
- Renderer/Web：初始化顺序、React Router、React 19 root 错误入口、ErrorView、播放器加载与运行时观察器、设置和页面导航。
- 构建发布：`electron-vite`、Vite、GitHub Actions、Sentry release/source-map 上传以及 Electron/Web 构建环境变量。
- 依赖：新增 `@sentry/electron`、Sentry 构建插件和 `posthog-js`，并锁定相互兼容的 Sentry SDK 版本。
- 配置：扩充 `.env.example`、Main/Renderer `ImportMetaEnv` 与 GitHub Actions Variables/Secrets。
- 与 `add-ffmpeg-compat-playback` 的关系：遥测契约依赖其稳定的 `PlaybackPlan`、`PlaybackSourceLease`、Media Gateway generation 和错误码；实现时避免与该开放变更同时修改相同播放器装配文件，待相关接口稳定后接入观察器。
