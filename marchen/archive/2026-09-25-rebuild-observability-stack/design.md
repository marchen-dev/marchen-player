## 背景

Marchen 是 Electron Main/Preload/Renderer 与纯 Web Renderer 双目标应用。当前 `@sentry/react` 只在 Renderer 的 `initializeApp()` 中启用，且开发态直接退出；Router 在初始化前已由静态 import 创建。Main 的 Sentry 文件全部注释，Preload 未初始化。React root、路由 ErrorView 和 `captureConsoleIntegration` 又可能捕获同一个错误多次。构建配置没有生成或上传 Source Map，CI 只传入 DSN，不建立 release/dist。

当前依赖是 `@sentry/react@10.71.0`；提案形成时，`@sentry/electron@7.17.0` 内部固定使用 Sentry JavaScript `10.70.0`，而 `@sentry/react` 最新为 `10.72.0`。Electron 官方支持由 Electron Renderer init 组合框架 init，但前提是共享的 Sentry core 不发生不可控分裂，因此不能把各 Sentry 包独立追到不同最新版。

播放器重构还引入了新的高频面：约两秒一个的 fMP4 HLS segment、manifest 轮询、seek generation、持续弹幕 DOM mutation、字幕和时间轴刷新。现有 100% browser trace 加 HTTP 自动观测若直接覆盖 localhost Media Gateway，会为一集视频制造数百个无业务价值的 span。另一方面，`PlaybackPlan`、稳定媒体错误码、source lease 和 generation 为摘要级播放器遥测提供了良好边界。

用户已提供 US Cloud PostHog Project Token/Host，并明确希望普通业务与诊断上下文尽可能完整上报、不做常规文本脱敏。Project Token 与 DSN 都是客户端公开配置；Source Map 上传认证 Token、AI API Key 和本地 Media Gateway bearer token 仍属于可直接授予能力的秘密，必须留在客户端或 CI。

## 目标与非目标

**目标：**

- 让 Electron Main、Preload、Renderer 与 Web Renderer 的错误、原生崩溃、日志和关键性能统一进入 Sentry。
- 用 PostHog 建立可计算 DAU/MAU、留存、页面/功能使用和播放漏斗的稳定产品事件与匿名身份。
- 同一次逻辑错误只产生一个权威异常，同一次逻辑状态转换只产生一个产品事件。
- 在保留详细诊断上下文的同时，把 HLS 分片、DOM mutation 和 tick 收敛为有界摘要。
- 为所有生产 JavaScript 产物建立 release、dist、Debug ID 和 Source Map，保证新事件可还原到源码。
- Electron 与 Web 使用同一个产品分析项目并通过公共属性分端；本地开发可显式验收且默认不污染生产。
- 保持纯领域包供应商无关，并与正在进行的 FFmpeg 兼容变更通过稳定公开状态衔接。

**非目标：**

- 不建立自建分析后端、数据仓库或 Sentry/PostHog 私有部署。
- 不将 PostHog Error Tracking 作为第二套错误管理系统。
- 不为每个媒体 segment、弹幕节点、字幕帧或进度 tick 生成事件。
- 不用 Feature Flag 控制数据库迁移、媒体安全、FFmpeg 资源治理或核心播放正确性。
- 不在本变更修改播放器、影视库和 FFmpeg 的用户行为，也不扩展到手机、平板或触控端。
- 不承诺从客户端绕过广告拦截、企业网络或离线环境；只提供有界关键事件补发和可观测的丢弃策略。

## 决策

### 1. Sentry 负责工程可观测，PostHog 负责产品分析

职责固定如下，避免同一信号在两套平台形成两个真相来源：

```text
                    Sentry                         PostHog
错误/原生崩溃       权威来源                       关闭 Error Tracking
结构化日志           Main/Preload/Renderer          不采集为错误
性能                 导航/API/播放器关键 span       Web Vitals 与产品耗时
错误会话回放         100% 错误回放                  不作为错误入口
普通会话回放         关闭或低采样                   远端采样/触发
DAU/MAU/留存          不承担                         权威来源
功能/播放漏斗         breadcrumb/错误上下文          权威来源
Feature Flag         不承担                         仅非关键 UI/实验
```

Main 和 Preload 不引入 PostHog Node 客户端。产品会话从 Renderer 可交互就绪开始计算，避免 Main/Renderer 双客户端产生两套 distinct ID、重复启动事件和离线队列。Main 生命周期与 FFmpeg 诊断通过 Sentry 记录；需要进入产品漏斗的结果由类型安全 IPC/公开状态回到 Renderer 后发送。

### 2. 精确锁定兼容的 Sentry 版本族

首个实现基线使用 `@sentry/electron@7.17.0` 所依赖的 Sentry JavaScript `10.70.0`，将 `@sentry/react` 精确对齐到 `10.70.0`，并使用当前验证过的 Sentry 构建插件。pnpm lock 中必须只有预期的 Sentry core 版本；升级时把 Electron、React、构建插件作为一组验证，而不是分别升级。

PostHog 使用实现时验证过的 `posthog-js` 最新稳定版；提案时基线为 `1.422.5`。版本记录在 lockfile，Electron 与 Web 必须从同一版本和同一导入路径族构建。

### 3. 按构建目标提供适配器，避免 Web 打入 Electron SDK

Renderer 公开一个供应商无关的遥测门面，包含：

```ts
interface TelemetryClient {
  identify(identity: TelemetryIdentity): void
  capture<E extends TelemetryEventName>(name: E, properties: TelemetryEventMap[E]): void
  captureException(error: unknown, context?: ErrorContext): string | undefined
  addBreadcrumb(breadcrumb: TelemetryBreadcrumb): void
  startSpan<T>(span: TelemetrySpan, run: () => T | Promise<T>): T | Promise<T>
  flush(): Promise<void>
  reset(): Promise<void>
}
```

`__MARCHEN_TARGET__ = 'electron' | 'web'` 由两套构建配置注入并让 bundler 静态裁剪目标适配器：

- Electron Main：`@sentry/electron/main`。
- Electron Preload：`@sentry/electron/preload`。
- Electron Renderer：`@sentry/electron/renderer` 以 `@sentry/react` init 作为框架 init 组合；PostHog 使用 `posthog-js/dist/module.full.no-external`，把 Replay 等扩展一并打包，避免 Electron 运行时拉取远端代码。
- Web Renderer：直接使用 `@sentry/react` 与默认 `posthog-js`。

纯 `packages/*` 不 import 门面或供应商 SDK。它们继续输出状态、错误码与时间数据，由 `src/renderer/src/services/telemetry/` 中的观察器消费。

### 4. 入口先初始化遥测，再动态加载应用

Renderer 入口只负责读取构建常量、初始化目标适配器，然后动态 import 应用 bootstrap。Router、React root、player-loading singleton 和业务组件都在初始化完成后加载。初始化失败必须降级为空实现，不能阻止播放器启动。

Main 同样拆分为最小 instrumentation 入口与实际 bootstrap；在加载窗口、IPC、FFmpeg 和 Media Gateway 模块前初始化 Electron SDK。开发态 `appData` 路径选择要先于匿名身份与本地遥测状态读取，避免开发版本触碰正式身份。Preload 在暴露 bridge 前初始化，并将初始化失败降级为 console warning。

早期错误可能发生在身份异步读取前：Sentry 先捕获事件，身份准备后设置后续 scope；应用启动事件只有在身份和 PostHog 就绪后发送。

### 5. 使用随机安装身份，不使用硬件 machine ID

Electron Main 在 `userData` 的遥测命名空间保存随机 UUID，Renderer 通过只读 IPC 获取；Web 使用产品分析 SDK 的持久化 anonymous distinct ID，并同步给 Sentry。每次进程启动生成 `app_session_id`，每次逻辑播放生成 `playback_session_id`。

```text
install_id             同一安装长期稳定，应用重置后更换
app_session_id         每次应用启动更换
playback_session_id    每次逻辑播放更换，fallback/seek 不更换
attempt_id             direct/fallback 等尝试更换
generation             兼容流 seek generation 更换
```

应用重置需要清除 PostHog identity、Feature Flag 缓存、自建 outbox、Electron install ID，并调用 Sentry user reset。由于没有账号，DAU/MAU 的产品含义明确为“活跃安装”，不能宣称为真实人数；一人多设备和重置会被视为不同安装。

### 6. 统一公共字段，但区分可索引属性与诊断上下文

所有事件包含：

```text
release, dist, version, commit, environment
app_target, runtime, platform, arch
install_id, app_session_id
```

播放事件额外包含 `playback_session_id`、`operation_id`、`attempt_id`、`generation`。容器、codec、播放模式、transport、reason、error_code 使用稳定枚举；分辨率、duration、bitrate、耗时使用有限桶或数值字段。

普通 UI 文本、文件名、原始路径和有界 FFmpeg stderr 可以进入 Sentry 的非索引 context/attachment，以满足详细诊断需求；它们不得成为 tag、fingerprint 或 PostHog 聚合维度。PostHog 只接收适合聚合的标准化属性，防止每个文件产生新的属性值。

发送前仅执行“能力秘密过滤”，不做常规隐私遮蔽：

- 移除 AI Provider `apiKey`、Authorization/Cookie 等认证头。
- 将 Media Gateway URL 中的高熵 token 替换为固定占位符，保留 route、generation 和资源类型。
- 对请求/响应、stderr、对象图和 attachment 设置大小上限，超限时截断并记录 `truncated=true`。

### 7. 重新定义 Sentry 捕获入口

移除把所有 `console.error` 自动转为异常问题的做法。默认 console 集成只提供 breadcrumb；明确的失败由遥测门面以稳定机制和上下文捕获。结构化日志开启 Sentry Logs，并对 Main 的现有 electron-log 建立适配，预期降级使用 warning/info。

React root 三个入口显式定义：

- `onUncaughtError`：唯一未处理异常入口。
- `onCaughtError`：已由 Error Boundary 处理，设置 handled 并保留组件栈。
- `onRecoverableError`：单独机制和较低优先级，避免与最终异常合并。

路由 ErrorView 不在 render 中 `console.error`，只展示错误并为尚未被 root 捕获的 route loader/action 错误执行一次幂等捕获。事件 ID 或 WeakSet/稳定错误键用于同一页面生命周期内去重；全局 fingerprint 只使用错误类型、稳定错误码和归一化堆栈，不使用消息中的路径/token。

React Router 使用当前 SDK 的通用 `reactRouterBrowserTracingIntegration`，不再使用已弃用的 v7 命名 API，并通过路由订阅显式设置稳定页面名。升级后的 React Router 8 需要用类型检查和真实 HashRouter 导航测试确认兼容。

### 8. Sentry 全量关键 span，但排除媒体请求洪流

初期保留关键事务 100% 采样，以满足用户希望尽可能完整观测的目标；在发送前按 span 类别过滤：

- 保留应用启动、页面导航、API、视频导入、hash、match、danmaku、prepare、probe、plan、fallback、首片、首帧、seek、stall、结束与失败。
- 排除 localhost Gateway 的单个 `.m4s`、`init.mp4` 和 manifest 轮询 HTTP span。
- 保留每个 generation 的汇总 span，附带 segment count、produced duration、bytes written、startup time 和结束原因。
- 仅在弹弹play代理明确允许 `sentry-trace`/`baggage` 且后端能消费时启用跨域 trace propagation；否则只生成客户端 span。

保留服务端远程调整采样的余地，但任何采样变化不得改变产品事件的幂等语义。

### 9. PostHog 开启产品能力但关闭重复错误入口

PostHog 使用 US ingestion host 和项目 Token，采用当前官方 `defaults` 快照。默认启用 autocapture、pageleave、Web Vitals、Feature Flags 和 Session Replay；关闭 exception autocapture/Error Tracking。由于 HashRouter 和 Electron file URL 不适合自动 pageview，页面事件由 Router 订阅显式发送稳定 route，自动 pageview 关闭。

普通回放由 PostHog 远端采样或事件触发；Sentry 普通回放关闭、错误回放 100%。两个回放适配器共享标记：视频、弹幕运动层、字幕实时层和时间轴高频节点不录制 mutation，播放器外壳、按钮、设置和导航保留。普通文本默认不 mask，输入控件遵守 SDK 无法安全绕过的内建限制。

Feature Flag 在启动时使用本地默认值并异步更新；只允许非关键 UI 和实验读取。Flag 结果加入相关产品事件，但不在纯领域层读取远端 Flag。

### 10. 类型安全事件契约与状态边界观察器

事件名和属性集中定义，第一期至少包含：

```text
app_session_started / app_session_ended
page_viewed / feature_used
video_import_started / video_import_completed / video_import_failed
danmaku_match_completed
media_prepare_completed
compat_fallback_triggered
playback_started / playback_stalled / playback_ended / playback_failed
```

`player-loading` 单例状态订阅负责导入、hash、匹配和弹幕阶段；player runtime 的装配层负责 prepare、plan、fallback、首帧、seek、stall、结束和功能操作。观察器维护 `operation_id + state transition` 门禁，丢弃已取消 generation 的迟到结果。自动下一集关闭旧 playback session 后创建新 session。

Sentry breadcrumb 与 PostHog 事件从同一规范化事件产生，但路由不同：错误相关过程可成为 breadcrumb，产品结果进入 PostHog。详细媒体路径和 stderr 只进入失败时的 Sentry context。

### 11. 关键事件使用隔离、有界的离线 outbox

PostHog SDK 自身的批处理和持久化继续使用；另建一个与 HISTORY 数据库隔离的小型 IndexedDB outbox，只保存漏斗关键事件，不保存 Replay 或详细错误附件。每条事件包含随机 `$insert_id`，默认最多 500 条、最长保留 7 天，采用指数退避；超过边界按最旧优先丢弃并记录本地计数。

选择隔离数据库是为了不增加 HISTORY 业务 schema 的迁移耦合。应用重置显式删除 outbox；发送成功后删除，网络反复切换不得重复计数。若验收证明当前 PostHog SDK 已完整满足这些语义，可用兼容测试替代自建发送层，但 spec 的有界与幂等行为保持不变。

### 12. release、dist 与 Source Map 由构建常量统一

构建生成：

```text
release = Marchen@<package-version>+<git-commit>
dist    = web | win32-x64 | darwin-x64 | darwin-arm64
```

并注入 `__MARCHEN_RELEASE__`、`__MARCHEN_DIST__`、`__MARCHEN_COMMIT__`、`__MARCHEN_TARGET__`。Main、Preload、Electron Renderer 与 Web 均使用同一生成模块，避免各自拼接。开发构建使用 `development` release/dist，不上传 artifact。

Electron Vite 的 Main、Preload、Renderer 以及 Web Vite 均生成 hidden Source Map，由 Sentry 构建插件注入 Debug ID、上传后删除 map。项目自有 Worker 也必须进入上传范围。正式 CI 使用：

- `SENTRY_AUTH_TOKEN`：Secret，仅构建插件读取。
- `SENTRY_ORG`、`SENTRY_PROJECT`：Actions Variable 或非敏感配置。
- `VITE_SENTRY_DSN`、`VITE_POSTHOG_KEY`、`VITE_POSTHOG_HOST`：客户端构建配置。

平台 job 可上传各自 artifact，但由单一 finalize job 在所有必要构建成功后设置 commits、完成 release 与 deploy。正式 tag 构建缺少认证或上传失败即停止分发；本地构建无 Token 时明确 skip。

### 13. 与 FFmpeg 变更按公开契约串行接入

`add-ffmpeg-compat-playback` 正在修改 Main 初始化、播放器 loading/runtime、lease、gateway 和 workflow。当前变更先完成独立基础设施、入口、身份、发布诊断和事件契约；涉及 `PlaybackPlan`、generation 与 fallback 的观察器在 FFmpeg 类型和错误码稳定后实现。不得为了遥测让纯 planner、session 或 engine 直接依赖 SDK，也不得持久化临时 lease URL。

## 风险与权衡

- **SDK 版本漂移：** Electron SDK 通常滞后于 React SDK。精确对齐会暂时放弃 React 最新 patch，但可避免多个 Sentry core；升级必须作为一组验证。
- **初始化与启动稳定性：** 提前初始化扩大捕获范围，也可能让第三方 SDK 故障影响启动。所有遥测初始化必须 fail-open，并设置短超时或异步加载非关键能力。
- **100% 关键追踪成本：** 即使排除分片，生产规模增长后仍可能昂贵。先用明确 span 分类观测真实量，再通过远端配置或版本化采样调整。
- **Replay CPU 与带宽：** DOM 弹幕和字幕是高风险区域。必须以真实长视频、密集弹幕和低性能机器验证录制开销，不能只验证事件到达。
- **产品“用户量”语义：** 匿名 install ID 只能衡量活跃安装，无法跨设备合并真实用户。后续若加入账号体系，再使用 alias/identify 迁移，不能回填臆测身份。
- **离线数据仍可能丢失：** 进程崩溃、存储清理和队列上限会造成欠计；仪表盘需展示数据定义和可能低估，不能把客户端事件当绝对计费事实。
- **客户端阻拦：** Web 端可能被广告拦截或 CSP 阻止；Electron 更稳定但也受网络影响。未来可增加第一方 ingest proxy，本变更先确保 CSP/connect-src 与错误诊断明确。
- **详细上下文体积：** 不做常规脱敏会增加 payload 和高基数风险。详细内容必须留在有界 context，聚合标签和产品属性保持标准化，否则事件可能被 413 拒绝或难以检索。
- **CI 并行发布复杂度：** 当前 Electron 三平台与 Web 分属并行 workflow。需要明确 artifact 上传、release finalize 与 GitHub Release 的依赖，避免某个平台提前发布不可符号化产物。
- **开放变更冲突：** FFmpeg 兼容变更仍在同一工作树大范围修改。实施顺序不当会造成播放器观察器与 Main 初始化冲突，因此 tasks 明确把依赖接口后的工作放在后段。
