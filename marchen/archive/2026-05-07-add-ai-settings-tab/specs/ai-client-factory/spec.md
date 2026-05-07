## 目的

提供统一的 AI 客户端工厂，根据用户激活的 Provider 配置创建 AI SDK 实例，供后续功能模块（翻译、摘要等）消费。

### 需求: 创建 Provider 实例

系统 SHALL 根据当前激活的 Provider 配置，创建对应的 AI SDK provider 实例。

#### 场景: 创建 OpenAI 实例

- **GIVEN** 当前激活的 Provider 类型为 OpenAI
- **WHEN** 功能模块请求 AI model 实例
- **THEN** 系统使用配置的 apiKey、baseUrl 创建 OpenAI provider
- **AND** 返回指定 model 的可调用实例

#### 场景: 创建 Anthropic 实例

- **GIVEN** 当前激活的 Provider 类型为 Anthropic
- **WHEN** 功能模块请求 AI model 实例
- **THEN** 系统使用配置的 apiKey、baseUrl 创建 Anthropic provider
- **AND** 返回指定 model 的可调用实例

### 需求: 无激活 Provider 时的行为

系统 SHALL 在没有激活 Provider 时返回 null，调用方据此判断 AI 功能是否可用。

#### 场景: 未配置任何 Provider

- **GIVEN** 用户没有配置任何 AI Provider
- **WHEN** 功能模块请求 AI model 实例
- **THEN** 返回 null
- **AND** AI 相关功能不可用（UI 上对应功能灰显或隐藏）
