## 背景

当前设置页有 3 个 tab（通用、播放器、关于），通过 `settingTabs` 数组注册。设置持久化使用 `atomWithStorage` + localStorage。API 请求层在 `request/` 目录，使用 ofetch。项目需要为后续 AI 功能（翻译、摘要、智能匹配）提供配置入口。

## 目标与非目标

**目标：**
- 新增 AI 设置 Tab，支持多 Provider CRUD 和激活切换
- 提供模型列表动态获取和连接测试
- 创建 AI 客户端工厂，供后续功能模块消费
- 遵循现有设置系统的模式（atom + view + tab 注册）

**非目标：**
- 不实现具体 AI 功能（翻译、摘要等）——那是后续变更
- 不做 API Key 加密存储——明文 localStorage 够用
- 不做 Provider 配额/用量监控

## 决策

### 1. 使用 Vercel AI SDK 作为统一接口

选择 `ai` + `@ai-sdk/openai` + `@ai-sdk/anthropic`。

**理由：** 统一接口，切换 provider 只需改 factory 函数；内置 streaming 支持；12M+ 周下载量，维护活跃。后续加翻译/摘要功能时直接调 `generateText` / `streamText`，不需要自己封装 HTTP。

**替代方案（不选）：** 直接用 ofetch 调各家 API——需要自己处理 streaming、错误格式差异、token 计算，工作量大且不统一。

### 2. Provider 配置用数组存储，支持同类型多实例

```typescript
interface AIProviderConfig {
  id: string              // nanoid 生成
  type: 'openai' | 'anthropic'
  name: string
  apiKey: string
  baseUrl: string
  model: string
}

interface AISettings {
  providers: AIProviderConfig[]
  activeProviderId: string | null
}
```

**理由：** 用户可能有多个同类型 provider（官方 + 代理），数组比固定字段更灵活。`activeProviderId` 指向当前使用的那个。

### 3. 模型列表获取放在 `request/api/ai.ts`

AI 的 `/v1/models` 请求不走现有的 `apiFetch`（因为 baseURL 和 headers 都是动态的），但文件组织上放在 `request/api/` 保持一致性。内部直接用 `ofetch` 创建独立请求。

**理由：** 遵循用户对项目结构的偏好，所有 API 调用统一在 `request/api/` 下。

### 4. AI 客户端工厂放在 `lib/ai/client.ts`

```typescript
export function getActiveAIModel(): LanguageModel | null
```

从 jotaiStore 读取当前 AI 设置，根据 activeProvider 创建对应的 SDK 实例。返回 null 表示未配置。

**理由：** `lib/` 是无状态工具函数的位置，AI client 是根据配置创建实例的工厂，不需要自己的状态管理。

### 5. UI 使用弹窗表单（Dialog）进行 Provider 编辑

添加/编辑 Provider 使用 Dialog 弹窗而非内联表单。

**理由：** 表单字段较多（5 个），内联展开会让设置页过长。Dialog 聚焦操作，完成后关闭，列表保持简洁。项目已有 Dialog 组件（shadcn/ui）。

### 6. 模型选择使用 Combobox（可搜索 + 手动输入）

模型字段支持：从 API 获取的列表中选择 + 手动输入自定义模型名。

**理由：** 兼容层可能不支持 `/v1/models` 端点，需要 fallback 到手动输入。Combobox 同时满足两种场景。

## 风险与权衡

| 风险 | 影响 | 缓解 |
|------|------|------|
| 兼容层不支持 /v1/models | 无法自动获取模型列表 | Fallback 到预设列表 + 手动输入 |
| API Key 明文存储 | 本地安全性较低 | 项目定位为个人工具，可接受 |
| AI SDK 包体积 | 增加 bundle size | tree-shaking 有效，只打包用到的 provider |
| localStorage 容量限制 | Provider 数量极多时可能溢出 | 实际场景不会超过 5-10 个，远低于 5MB 限制 |
