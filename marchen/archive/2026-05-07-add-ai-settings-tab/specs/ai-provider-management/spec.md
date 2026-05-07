## 目的

管理用户的 AI 服务商配置（多 Provider 支持），提供增删改查、激活切换和持久化存储。

### 需求: 添加 Provider

系统 SHALL 允许用户添加新的 AI 服务商配置，包含类型、名称、API Key、Base URL 和默认模型。

#### 场景: 添加 OpenAI 类型 Provider

- **GIVEN** 用户在 AI 设置页点击"添加服务商"
- **WHEN** 用户选择类型为 OpenAI，填写 API Key 和 Base URL，选择模型
- **THEN** 系统创建一条新的 Provider 配置并持久化
- **AND** 新 Provider 出现在列表中

#### 场景: 添加 Anthropic 类型 Provider

- **GIVEN** 用户在 AI 设置页点击"添加服务商"
- **WHEN** 用户选择类型为 Anthropic，填写 API Key 和 Base URL，选择模型
- **THEN** 系统创建一条新的 Provider 配置并持久化

#### 场景: 首个 Provider 自动激活

- **GIVEN** 当前没有任何已配置的 Provider
- **WHEN** 用户添加第一个 Provider
- **THEN** 该 Provider 自动设为激活状态

### 需求: 编辑 Provider

系统 SHALL 允许用户修改已有 Provider 的配置信息。

#### 场景: 修改 API Key

- **GIVEN** 用户有一个已配置的 Provider
- **WHEN** 用户点击编辑，修改 API Key 并保存
- **THEN** 新的 API Key 被持久化
- **AND** 后续 AI 请求使用新的 Key

### 需求: 删除 Provider

系统 SHALL 允许用户删除已有的 Provider 配置。

#### 场景: 删除非激活 Provider

- **GIVEN** 用户有多个 Provider，要删除的不是当前激活的
- **WHEN** 用户点击删除并确认
- **THEN** 该 Provider 从列表中移除

#### 场景: 删除当前激活的 Provider

- **GIVEN** 用户要删除的是当前激活的 Provider
- **WHEN** 用户点击删除并确认
- **THEN** 该 Provider 被移除
- **AND** 激活状态清空（无激活 Provider）

### 需求: 切换激活 Provider

系统 SHALL 允许用户在多个 Provider 之间切换激活状态，同一时间只有一个 Provider 处于激活状态。

#### 场景: 切换到另一个 Provider

- **GIVEN** 用户有多个已配置的 Provider
- **WHEN** 用户点击某个非激活 Provider 的选择按钮
- **THEN** 该 Provider 变为激活状态
- **AND** 之前激活的 Provider 变为非激活

### 需求: 持久化存储

系统 SHALL 将所有 Provider 配置持久化到 localStorage，页面刷新后配置不丢失。

#### 场景: 刷新页面后恢复配置

- **GIVEN** 用户已配置了若干 Provider
- **WHEN** 页面刷新或应用重启
- **THEN** 所有 Provider 配置和激活状态恢复到之前的状态
