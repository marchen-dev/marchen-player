# Marchen Player 接入现状与约束

本文件描述当前仓库结构，不等同于弹弹play官方协议。修改前应重新检查对应源码，避免快照与代码漂移。

## 当前请求链路

- `VITE_API_URL` 默认值：`https://dandan-proxy.suemor.com/api/v2`
- 环境读取：`src/renderer/src/lib/env.ts`
- `ofetch` 公共实例：`src/renderer/src/request/ofetch.ts`
- 业务 API：`src/renderer/src/request/api/`
- 请求/响应类型：`src/renderer/src/request/models/`
- 统一导出：`src/renderer/src/request/index.ts`

由于代理根地址已经包含 `/api/v2`，项目业务路径使用 `/match`、`/comment/{episodeId}` 等相对版本根路径。只有直接请求官方根地址时才使用完整 `/api/v2/...`。

## 已有接口

| 模块 | 项目方法 | 项目路径 | 官方接口 |
|---|---|---|---|
| `api/match.ts` | `postVideoEpisodeId` | `/match` | `POST /api/v2/match` |
| `api/comment.ts` | `getDanmu` | `/comment/{episodeId}` | `GET /api/v2/comment/{episodeId}` |
| `api/bangumi.ts` | `getBangumiDetailById` | `/bangumi/{animeId}` | `GET /api/v2/bangumi/{bangumiId}` |
| `api/bangumi.ts` | `getBangumiShin` | `/bangumi/shin` | `GET /api/v2/bangumi/shin` |
| `api/search.ts` | `getSearchEpisodes` | `search/episodes` | `GET /api/v2/search/episodes` |

`getDanmu` 默认传 `withRelated: true`，注释说明代理返回的第三方弹幕已经处理时间偏移。

## 新增接口时

1. 从 `references/api-reference.md` 确认方法、路径、参数、body、响应和权限。
2. 从 `references/schemas.md` 或 `openapi.json` 生成准确类型；不要继续扩散已有的 `any`。
3. 在 `request/models/<domain>.ts` 声明模型，在 `request/api/<domain>.ts` 封装调用，并更新 `request/index.ts`（如当前导出方式需要）。
4. 沿用公共 `Get`、`Post`、`Delete`。确有 PUT/PATCH 等新方法时，再小范围扩展公共封装。
5. 保持 Web/Electron 双端可用，不在 Renderer 内放 AppSecret，也不要直接绕过现有代理。
6. 处理 `success: false` 的 HTTP 200 业务错误，并为外部调用提供可理解的中文降级提示。
7. 对搜索、弹幕和番剧数据使用 TanStack Query/Dexie 的现有缓存能力，缓存时长结合官方建议和产品实时性。

## 匹配与弹幕数据口径

- 支持视频仍遵循项目约定：mp4、mkv。
- `fileHash`：前 16 MiB 的 32 位 MD5，不区分大小写。
- `fileSize`：完整文件长度，单位 Byte。
- `videoDuration`：32 位整数，单位秒。
- `episodeId`：64 位标识。JavaScript `number` 对 64 位整数不保证全范围精确；新增链路时检查实际返回值和 JSON 解析策略，不要擅自做算术运算。
- 弹幕简化结构当前为 `{ cid, m, p }`，其中 `p` 是协议字符串；解析或生成前必须查接口 schema/项目播放器适配代码，不凭字段名猜格式。

