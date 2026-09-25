## 1. 依赖与构建元数据基线

- [x] 1.1 固定 `@sentry/electron`、与其 core 对齐的 `@sentry/react`、Sentry 构建插件和 `posthog-js` 版本，更新 lockfile，并验证最终依赖树没有非预期的重复 Sentry core/client
- [x] 1.2 扩充 `.env.example`、Main/Renderer `ImportMetaEnv` 与环境读取模块，加入 PostHog Key/Host、遥测开发诊断开关和 Sentry 构建期配置；缺少可选遥测配置时应用必须降级运行
- [x] 1.3 建立共享构建元数据生成逻辑，向 Electron Main/Preload/Renderer 和 Web 注入 target、release、dist、commit、version、environment 常量
- [x] 1.4 为构建元数据和 Electron/Web 目标选择添加单元测试，覆盖开发构建、Web dist 和各 Electron 平台/架构 dist

## 2. 遥测契约与秘密过滤

- [x] 2.1 在 Renderer 服务层定义供应商无关的 `TelemetryClient`、公共上下文、错误上下文、breadcrumb/span 与类型安全事件映射
- [x] 2.2 实现 fail-open 的 no-op client 与统一 facade，确保未配置、初始化失败或测试环境不会阻塞应用启动
- [x] 2.3 实现公共属性装配，将 release、dist、target、runtime、platform、arch、install/app/playback session 等字段一致附加到对应信号
- [x] 2.4 实现发送前能力秘密过滤与大小限制，覆盖 AI API Key、认证 header/cookie、Media Gateway token、循环对象、超长 stderr 和 attachment
- [x] 2.5 为类型契约、公共属性、Gateway URL 归一化、秘密过滤、截断与 no-op 降级添加测试

## 3. 匿名身份与应用会话

- [x] 3.1 在 Electron `userData` 遥测命名空间实现随机 install ID 的创建、读取、持久化与幂等并发访问，不使用 hardware machine ID
- [x] 3.2 通过类型安全 IPC 向 Renderer 只读提供 Electron install ID，并为 Web 建立可持久化且与 Sentry 同步的 anonymous identity
- [x] 3.3 实现每次启动唯一的 app session、应用就绪后的统一 identify 和 `app_session_started/ended` 事件
- [x] 3.4 将应用重置扩展为清理 PostHog identity、Feature Flag 缓存、离线 outbox、Electron install ID 与 Sentry user scope
- [x] 3.5 为多次启动身份稳定、应用重置换号、Main/Renderer 身份一致和 session 更新添加测试

## 4. Sentry 跨运行时初始化

- [x] 4.1 将 Main 拆为最小 instrumentation 入口和动态加载 bootstrap，在窗口、IPC、FFmpeg、Gateway 模块前初始化 `@sentry/electron/main`，并保证失败时继续启动
- [x] 4.2 调整开发 `appData` 路径选择顺序，确保开发身份、缓存与遥测状态不会读取正式应用目录
- [x] 4.3 在 Preload bridge 暴露前初始化 `@sentry/electron/preload`，设置 runtime/release 公共字段并验证初始化失败降级
- [x] 4.4 将 Renderer 拆为 instrumentation 入口和动态加载应用 bootstrap；Electron 用 Electron Renderer init 组合 React init，Web 使用 React init，并确保 Web bundle 不包含 Electron SDK
- [x] 4.5 使用通用 React Router tracing integration 与显式稳定路由名，验证 React Router 8 HashRouter 的页面加载和导航 span
- [x] 4.6 配置错误回放、结构化日志、HTTP 客户端 span 和本地 span；关闭普通 Sentry Replay，并排除 Gateway segment/manifest 请求洪流
- [x] 4.7 验证 Main、Preload、Electron Renderer、Web Renderer 的受控异常和 Electron 原生崩溃均进入正确 runtime/release

## 5. 错误、日志和回放去重

- [x] 5.1 移除把所有 `console.error` 自动升级为异常问题的配置，将 console 保留为 breadcrumb，并建立显式错误/预期降级日志入口
- [x] 5.2 重构 React root 的 uncaught、caught、recoverable handler，分别设置正确机制、handled 分类、组件栈与严重级别
- [x] 5.3 重构路由 ErrorView，移除 render 副作用并对 route loader/action 错误执行单次幂等捕获
- [x] 5.4 将 FFmpeg、Media Gateway、IPC 和播放器错误映射为稳定错误码、fingerprint、breadcrumb 与有界诊断 context；预期降级不得创建未处理问题
- [x] 5.5 为同一 React/路由异常单事件、recoverable 分类、console breadcrumb、稳定 fingerprint 和详细 context 添加回归测试
- [x] 5.6 为视频、DOM 弹幕、实时字幕和高频时间轴增加 Sentry/PostHog 共用回放隔离标记，并用密集弹幕验证控件与设置仍可回放

## 6. PostHog 产品分析基础

- [x] 6.1 实现 Electron PostHog `module.full.no-external` 适配器与 Web 默认适配器，使用同一项目和公共属性，并关闭 exception autocapture/Error Tracking
- [x] 6.2 配置 autocapture、pageleave、Web Vitals、Session Replay 与 Feature Flags；关闭自动 pageview，避免 `file://` 和 HashRouter 路由污染
- [x] 6.3 订阅 Router 状态发送稳定 `page_viewed`，覆盖 `/player`、`/library` 和设置分类，并避免重复初始 pageview
- [x] 6.4 为字幕、弹幕、倍速、全屏、匹配、影视库和设置等核心交互接入统一 `feature_used` 事件
- [x] 6.5 建立只允许非关键 UI 使用的 Feature Flag facade、本地默认值和缓存降级测试，确认离线时不影响播放和数据库行为
- [x] 6.6 实现与 HISTORY 隔离的关键事件离线 outbox，加入 `$insert_id`、500 条/7 天边界、指数退避、丢弃计数和应用重置清理
- [x] 6.7 为 Electron/Web 适配器裁剪、稳定 pageview、identity、Feature Flag 降级、outbox 幂等补发和边界淘汰添加测试

## 7. 播放器状态与质量遥测

- [x] 7.1 等 `add-ffmpeg-compat-playback` 的 PlaybackPlan、PlaybackSourceLease、generation 和稳定错误码接口确定后，冻结播放器遥测字段与枚举映射
- [x] 7.2 在 player-loading 应用装配层观察导入、hash、匹配、弹幕加载、取消和失败状态，发送带 operation ID 的单次阶段事件与 span
- [x] 7.3 在 player runtime 装配层建立 playback session/attempt/generation 生命周期，覆盖 prepare、plan、direct、fallback、首个资源和首帧
- [x] 7.4 接入 seek、waiting/playing、显著 stall、ended、用户退出、自动下一集和最终失败事件，汇总有效播放时长与卡顿质量
- [x] 7.5 将 Gateway/FFmpeg 的 segment count、produced duration、bytes、启动耗时、encoder 类别和结束原因汇总到 generation span，不发送逐 segment 产品事件
- [x] 7.6 把详细路径、命令和有界 stderr 仅附加到 Sentry 失败 context；PostHog 只发送 codec、容器、模式、原因、错误码与数值指标
- [x] 7.7 添加 Strict Effects、ready/reloading、快速换片、迟到 prepare、direct fallback、seek generation、自动下一集和取消场景的事件去重测试

## 8. Source Map 与发布流水线

- [x] 8.1 为 Electron Main、Preload、Renderer、Web 和项目自有 Worker 开启 hidden Source Map 与 Debug ID 注入，确保本地无认证 Token 时明确跳过上传
- [x] 8.2 配置 Sentry artifact 上传和上传后 Source Map 删除，验证安装包与 Web 部署目录不包含公开 `.map` 或 `SENTRY_AUTH_TOKEN`
- [x] 8.3 更新 Electron release workflow，注入 PostHog 客户端变量、Sentry release/dist 与上传认证，并让缺失正式发布配置或上传失败阻止分发
- [x] 8.4 更新 Web deploy workflow，注入相同 release 与 PostHog 配置，在部署前完成 Web Source Map 上传与产物检查
- [x] 8.5 将多平台 artifact 上传与 release finalize 分离，由单一协调 job 设置 commits、完成 release 和 deploy，避免并行 job 提前完成
- [x] 8.6 更新 Renderer CSP 与 Electron 资源策略，允许必要的 Sentry/PostHog connect/worker，且 Electron PostHog 不依赖远端扩展代码
- [x] 8.7 为构建配置缺失、release/dist 不一致、Source Map 未删除和 Web bundle 意外包含 Electron SDK 添加脚本化门禁

## 9. 仪表盘、验收与运行手册

- [x] 9.1 在 PostHog 定义活跃安装、次日/七日/三十日留存、启动到播放漏斗、功能使用率、兼容 fallback 率与播放失败率的事件口径说明
- [x] 9.2 为 Sentry 定义 runtime、release、dist、错误码、播放模式与平台的推荐查询，并记录“详细字段放 context、不放 tag”的约束
- [x] 9.3 运行类型检查、相关单元测试和 lint，确认纯领域包不依赖 Sentry/PostHog 且 Electron/Web 双构建通过
- [x] 9.4 使用显式 development 诊断开关在真实 Electron 与 Web 中验证错误、日志、route、产品事件、Replay、Feature Flag 和离线补发，结束后关闭开关
- [x] 9.5 构建发布候选并触发 Main、Preload、Renderer、Web 和 Worker 受控异常，确认 Sentry release/dist 正确且 stack trace 映射到原始源码
- [x] 9.6 使用普通直放、FFmpeg 兼容播放、长视频和密集弹幕样本测量 Replay CPU/内存/网络及事件量，确认没有逐分片洪流和明显播放回归
- [x] 9.7 完成带证据的本地验收页，列出 Sentry/PostHog 实际事件、Source Map、Replay、漏斗与性能结果，等待人工签核
