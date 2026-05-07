## 动机

项目计划集成 AI 功能（弹幕翻译、智能匹配增强、剧情摘要等），需要用户配置自己的 AI 服务商 API Key。当前设置页没有 AI 相关配置入口，需要新增一个 AI Tab，让用户管理多个 AI Provider（OpenAI / Anthropic 兼容层），并为后续 AI 功能提供统一的配置基础。

## 变更内容

- 新增设置页 AI Tab，支持多 Provider 管理（增删改、切换激活、测试连接）
- 新增 AI 设置持久化（localStorage）
- 新增 AI API 模块（获取模型列表、测试连接）
- 新增 AI 客户端工厂（基于 Vercel AI SDK，根据用户配置创建 provider 实例）
- 安装依赖：`ai`、`@ai-sdk/openai`、`@ai-sdk/anthropic`、`nanoid`

## 能力

### 新增能力

- `ai-provider-management`：AI 服务商配置管理（增删改、切换激活、持久化存储）
- `ai-model-fetching`：根据 API Key 动态获取可用模型列表
- `ai-connection-test`：测试 AI 服务商连接是否正常
- `ai-client-factory`：统一的 AI 客户端工厂，供后续功能模块消费

### 修改能力

- 无

## 影响范围

- 新建：`atoms/settings/ai.ts`、`request/api/ai.ts`、`request/models/ai.ts`、`lib/ai/client.ts`、`components/modules/settings/views/ai/`
- 修改：`components/modules/settings/tabs.tsx`（注册新 tab）、`request/index.ts`（加 ai 模块）
- 依赖：新增 `ai`、`@ai-sdk/openai`、`@ai-sdk/anthropic`、`nanoid`
- 不影响现有弹弹play API 请求逻辑和播放器功能
