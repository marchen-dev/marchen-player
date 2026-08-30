## 目的

让每个 Electron/Web 发布产物携带可追溯的 release 与 dist，并确保生产错误能够通过 Debug ID 和 Source Map 映射回对应源代码。

### 需求: 发布身份稳定且跨端一致

系统 SHALL 从应用版本和提交生成唯一 release，并 SHALL 为 Web、Windows、macOS 架构等构建目标生成可区分的 dist。

#### 场景: 同一标签构建多个目标

- **GIVEN** 一个发布标签同时触发 Web、Windows 和 macOS 构建
- **WHEN** 各目标提交遥测事件
- **THEN** 它们具有相同 release
- **AND** 每个构建目标具有不同且稳定的 dist
- **AND** 事件包含对应 commit、target、platform 与 arch

### 需求: 所有可执行 JavaScript 都可符号化

生产构建 SHALL 为 Main、Preload、Renderer、Web 和项目自有 Worker 生成匹配的 Source Map 与 Debug ID，并 SHALL 在用户获得产物前上传到对应 release。

#### 场景: Renderer 压缩代码抛错

- **GIVEN** 已发布 Renderer bundle 包含 Debug ID 且对应 Source Map 已上传
- **WHEN** 压缩代码抛出异常
- **THEN** 错误平台显示原始 TypeScript/TSX 文件、函数和行列位置

#### 场景: Worker 抛错

- **GIVEN** 项目自有 Worker 被独立打包
- **WHEN** Worker 中发生可捕获异常
- **THEN** 其 stack frame 可通过该 Worker 的 Debug ID 映射回源代码

### 需求: Source Map 不随产物公开分发

Source Map SHALL 在上传成功后从发布目录删除或阻止站点公开访问，正式客户端产物 MUST NOT 包含构建认证 Token。

#### 场景: Web 构建完成

- **GIVEN** CI 已完成 Source Map 上传
- **WHEN** 打包 Web 部署目录
- **THEN** 部署目录不公开 `.map` 文件
- **AND** 浏览器 bundle 中不存在 `SENTRY_AUTH_TOKEN`

### 需求: CI 对发布诊断配置执行门禁

正式发布 SHALL 在缺少必要上传凭据、Source Map 上传失败或 release 元数据不一致时失败；普通本地构建在没有上传凭据时 SHALL 能够成功并明确跳过上传。

#### 场景: 正式发布缺少认证 Token

- **GIVEN** 发布工作流没有配置 Source Map 上传认证 Token
- **WHEN** 执行正式发布构建
- **THEN** 工作流在分发安装包或 Web 产物前失败

#### 场景: 本地生产构建没有认证 Token

- **GIVEN** 开发者本地没有 Source Map 上传认证 Token
- **WHEN** 执行普通 Electron 或 Web 构建
- **THEN** 构建成功生成本地产物
- **AND** 输出明确说明已跳过远端上传

### 需求: 并行构建只完成一次 release 生命周期

各平台构建 MAY 并行上传各自 artifact，但 release 的 commits、最终完成状态和 deploy 标记 MUST 由单一协调步骤处理。

#### 场景: 三个平台并行完成

- **GIVEN** Windows、macOS 和 Web 构建以不同顺序完成
- **WHEN** 所有必要 artifact 上传成功
- **THEN** 单一发布步骤设置 commits、完成 release 并记录 deploy
- **AND** 并行 job 不会相互覆盖或提前完成 release

### 需求: 发布后可验证符号化链路

每次发布 SHALL 提供一个不会影响用户的验证方式，确认 release 可见、artifact 已上传且至少一个受控测试事件能够被正确符号化。

#### 场景: 发布候选验收

- **GIVEN** 发布候选已完成构建与上传
- **WHEN** 验收流程触发受控测试异常
- **THEN** 错误平台中的事件具有预期 release 和 dist
- **AND** stack trace 指向原始源码而非仅指向压缩 bundle
