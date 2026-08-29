## 目的

保持现有 AI Provider 配置能够在升级后的 SDK 上创建对应模型客户端。

### 需求: 保持 Provider 选择语义

AI 客户端 MUST 根据当前激活配置创建对应 Provider 的模型；不存在有效激活配置时 MUST 返回无模型状态。

#### 场景: 创建 OpenAI 模型客户端

- **GIVEN** 当前激活配置为有效的 OpenAI Provider
- **WHEN** 应用请求活动模型
- **THEN** 系统 MUST 使用配置的密钥、基础地址和模型名创建 OpenAI 模型

#### 场景: 创建 Anthropic 模型客户端

- **GIVEN** 当前激活配置为有效的 Anthropic Provider
- **WHEN** 应用请求活动模型
- **THEN** 系统 MUST 使用配置的密钥、基础地址和模型名创建 Anthropic 模型

#### 场景: 无有效激活配置

- **GIVEN** 未选择 Provider 或激活配置不存在
- **WHEN** 应用请求活动模型
- **THEN** 系统 MUST 返回无模型状态
- **AND** 不得构造带不完整凭据的客户端

### 需求: 保持设置兼容

升级后的 AI 客户端 MUST 继续读取现有持久化 Provider 设置，不得要求用户因 SDK 升级重新配置。

#### 场景: 读取已有设置

- **GIVEN** 用户升级前已保存 Provider 配置
- **WHEN** 升级后的应用加载 AI 设置
- **THEN** 原有配置 MUST 可继续展示和选择
- **AND** 连接测试与模型创建 MUST 使用同一配置语义
