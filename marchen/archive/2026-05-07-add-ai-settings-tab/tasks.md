## 1. 基础设施

- [x] 1.1 安装依赖：`ai`、`@ai-sdk/openai`、`@ai-sdk/anthropic`、`nanoid`
- [x] 1.2 创建 `request/models/ai.ts`：定义 AIProviderConfig、AISettings、AIModelInfo 等类型
- [x] 1.3 创建 `atoms/settings/ai.ts`：使用 createSettingATom 创建 AI 设置 atom 和 hooks

## 2. API 层

- [x] 2.1 创建 `request/api/ai.ts`：实现 fetchModels（根据 type/apiKey/baseUrl 获取模型列表）和 testConnection（验证连通性）
- [x] 2.2 在 `request/index.ts` 中注册 ai 模块到 apiClient

## 3. AI 客户端工厂

- [x] 3.1 创建 `lib/ai/client.ts`：实现 getActiveAIModel() 工厂函数，根据激活的 provider 配置创建 AI SDK 实例

## 4. 设置页 UI

- [x] 4.1 创建 `components/modules/settings/views/ai/AIView.tsx`：AI 设置页主组件，包含 Provider 列表和添加按钮
- [x] 4.2 创建 Provider 卡片组件：显示 provider 信息、激活 radio、编辑/删除按钮
- [x] 4.3 创建 Provider 编辑 Dialog：表单包含类型选择、名称、API Key、Base URL、模型 Combobox
- [x] 4.4 实现模型 Combobox：支持从 API 获取列表 + 预设列表 fallback + 手动输入
- [x] 4.5 实现测试连接按钮：调用 testConnection，显示成功/失败状态
- [x] 4.6 在 `tabs.tsx` 中注册 AI tab
