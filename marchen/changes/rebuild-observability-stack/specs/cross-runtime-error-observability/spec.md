## 目的

为 Electron 与 Web 桌面端建立一致的错误、日志、性能和崩溃观测能力，使生产问题能够关联到发生它的运行时、会话与用户操作上下文。

### 需求: 覆盖所有应用运行时

系统 SHALL 捕获 Electron Main、Preload、Renderer 和 Web Renderer 中未处理的 JavaScript 异常，并 SHALL 捕获 Electron 支持的原生崩溃与进程异常。

#### 场景: Main 进程发生未处理异常

- **GIVEN** 已发布的 Electron 应用正在运行
- **WHEN** Main 进程发生未处理异常
- **THEN** 错误平台收到包含 `runtime=main` 的事件
- **AND** 事件包含应用版本、release、平台、架构和应用会话标识

#### 场景: Renderer 发生原生崩溃

- **GIVEN** Electron Renderer 已完成监控初始化
- **WHEN** Renderer 发生可由 Electron 崩溃报告器捕获的崩溃
- **THEN** 错误平台收到对应崩溃报告
- **AND** 报告可关联到该应用 release 与运行时

### 需求: 错误只形成一个权威事件

系统 MUST 为 React root、路由错误边界、显式异常捕获和 console 日志定义唯一职责，同一次逻辑错误 MUST NOT 因多个入口生成重复问题。

#### 场景: 路由渲染失败

- **GIVEN** 页面渲染异常同时到达 React 错误入口和路由错误页
- **WHEN** 系统上报该异常
- **THEN** 只生成一个权威异常事件
- **AND** 事件的 handled 分类与实际是否被应用恢复一致
- **AND** 其他入口只追加 breadcrumb 或上下文

### 需求: 结构化上下文与日志

系统 SHALL 在错误事件中提供稳定标签、结构化上下文和最近操作 breadcrumb，并 SHALL 将预期降级日志与异常问题区分。

#### 场景: FFmpeg 兼容播放失败

- **GIVEN** 兼容播放任务以稳定错误码失败
- **WHEN** Main 或 Renderer 上报该失败
- **THEN** 事件包含错误码、播放计划、运行时、平台与播放会话标识
- **AND** 大段 stderr 作为有界诊断上下文存在而不作为问题标题或高基数标签

#### 场景: 可恢复降级成功

- **GIVEN** 一次操作失败后应用已成功降级继续工作
- **WHEN** 系统记录该结果
- **THEN** 记录结构化 warning 或 breadcrumb
- **AND** 除非最终用户操作失败，否则不创建未处理异常问题

### 需求: 性能追踪与分布式追踪边界

系统 SHALL 记录页面导航、关键 API 请求与播放器关键阶段的性能跨度；仅当远端服务明确支持对应追踪协议时，系统才 SHOULD 向跨域请求传播追踪头。

#### 场景: API 不支持追踪头

- **GIVEN** 弹弹play代理未声明支持追踪头或对应 CORS 响应
- **WHEN** Renderer 发起 API 请求
- **THEN** 请求仍可记录本地客户端 span
- **AND** 请求不得因附加追踪头产生额外预检失败

### 需求: 错误关联回放

生产环境 SHALL 为错误会话保留回放，并 MAY 对普通会话采样；回放 SHALL 保持播放器控制和操作路径可见，同时 MUST 避免高频媒体渲染使录制不可用。

#### 场景: 播放器发生错误

- **GIVEN** 用户在播放器中触发已上报异常
- **WHEN** 错误事件提交
- **THEN** 事件可跳转到同一会话的错误回放
- **AND** 回放包含导航、点击、设置和播放器外壳状态
- **AND** 视频画面、连续弹幕运动、字幕高频更新和时间轴刷新不产生持续高频快照

### 需求: 秘密不得进入遥测

系统 MAY 上报普通界面文本、文件诊断信息和业务上下文，但 MUST NOT 上报可直接授予访问权限的认证凭据、AI API Key 或 Media Gateway bearer token。

#### 场景: 错误上下文包含本地网关 URL

- **GIVEN** 错误对象或 breadcrumb 包含带访问 token 的 localhost 媒体 URL
- **WHEN** 遥测事件准备发送
- **THEN** 事件保留资源类型、generation 和路由类别
- **AND** 可直接访问媒体的 token 不出现在最终 payload 中

### 需求: 开发环境可控验收

开发环境 SHALL 默认不向生产项目发送遥测，但 SHALL 提供显式诊断开关以验证各运行时的错误、日志、追踪和回放链路。

#### 场景: 默认启动开发版本

- **GIVEN** 开发者未开启遥测诊断开关
- **WHEN** 应用启动
- **THEN** 不向生产 Sentry 项目发送事件

#### 场景: 开启开发诊断

- **GIVEN** 开发者显式开启遥测诊断开关
- **WHEN** 触发测试异常
- **THEN** 事件以 development 环境上报
- **AND** 不与 production 事件混淆
