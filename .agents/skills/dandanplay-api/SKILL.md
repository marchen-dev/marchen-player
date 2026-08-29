---
name: dandanplay-api
description: 查询、核对和接入弹弹play开放弹幕网络 API v2。用户询问弹弹play鉴权、文件识别、节目匹配、弹幕、番剧、搜索、用户接口，或要在 Marchen Player 中新增/修改弹弹play请求时使用。
---

# 弹弹play API

以随 Skill 保存的官方文档快照为依据，不凭记忆猜测路径、字段或鉴权方式。

## 资料路由

- 在本项目中新增或修改接口前，先读 [references/project-integration.md](references/project-integration.md)，沿用现有代理、请求封装和类型目录。
- 涉及 AppId、AppSecret、签名、JWT、错误、额度、缓存或使用约定时，读 [references/integration-guide.md](references/integration-guide.md)。
- 查询接口时，在 [references/api-reference.md](references/api-reference.md) 中按 HTTP 方法、完整路径、标签、摘要或 `operationId` 搜索。
- 展开请求/响应模型时，再到 [references/schemas.md](references/schemas.md) 搜索模型名。
- 生成类型、核对组合 schema 或 Markdown 信息不足时，读取 [references/openapi.json](references/openapi.json)。这是完整的官方 OpenAPI 快照。

## 工作要求

1. 先判断调用走项目代理还是官方 `https://api.dandanplay.net`。本项目默认代理地址已经包含 `/api/v2`，业务模块中的路径不要再次添加该前缀。
2. 同时检查 HTTP 状态和响应体的 `success`、`errorCode`、`errorMessage`；业务错误可能使用 HTTP 200 返回。
3. 不要在 Renderer、公开仓库、日志、示例或回复中写入真实 `AppSecret`。桌面端/纯前端优先走已有服务端代理；若直连，遵循官方签名模式。
4. OpenAPI 的 `security` 数组不能代替接入指南：普通请求也需要应用身份；受限接口还需要用户 JWT，而且官方当前说明受限接口暂不对新应用开放。
5. 新增接口时保持 Electron/Web 双端兼容，沿用 `request/api/`、`request/models/` 与 `request/ofetch.ts`，不要另建平行请求客户端。
6. 文件匹配必须保持协议口径：文件名前 16 MiB 的 MD5、完整文件字节数、秒级时长，并保存视频与 `episodeId` 的关联。
7. 只在用户要求刷新文档时运行 `python3 scripts/sync_openapi.py`；实现关键接口时可在线只读核对官方 Swagger，发现差异要说明快照日期和当前定义。

## 官方来源

- 接入指南：<https://doc.dandanplay.com/open/>
- Swagger UI：<https://api.dandanplay.net/swagger/index.html>
- OpenAPI JSON：<https://api.dandanplay.net/swagger/v2/swagger.json>
