## 目的

根据用户配置的 API Key 和 Base URL，动态获取该服务商可用的模型列表，用于设置页的模型选择。

### 需求: 获取模型列表

系统 SHALL 能够调用 AI 服务商的 models API 获取当前 Key 可用的模型列表。

#### 场景: 获取 OpenAI 模型列表

- **GIVEN** 用户填写了有效的 OpenAI API Key 和 Base URL
- **WHEN** 用户触发"获取模型列表"操作
- **THEN** 系统调用 GET /v1/models 端点
- **AND** 返回可用模型的 ID 列表供用户选择

#### 场景: 获取 Anthropic 模型列表

- **GIVEN** 用户填写了有效的 Anthropic API Key 和 Base URL
- **WHEN** 用户触发"获取模型列表"操作
- **THEN** 系统调用 GET /v1/models 端点（带 anthropic-version header）
- **AND** 返回可用模型的 ID 列表供用户选择

#### 场景: API Key 无效时的错误处理

- **GIVEN** 用户填写了无效的 API Key
- **WHEN** 用户触发"获取模型列表"操作
- **THEN** 系统显示错误信息（如 "401 Unauthorized"）
- **AND** 模型选择 fallback 到预设列表和手动输入

### 需求: Fallback 到预设列表

系统 SHOULD 在无法获取模型列表时，提供预设的常用模型列表供用户选择，同时支持手动输入任意模型名。

#### 场景: 网络不可用时使用预设列表

- **GIVEN** 网络不可用或 Base URL 不支持 /v1/models 端点
- **WHEN** 获取模型列表失败
- **THEN** 模型选择框显示预设的常用模型列表
- **AND** 用户可以手动输入自定义模型名称
