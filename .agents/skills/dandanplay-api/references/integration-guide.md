# 弹弹play开放弹幕网络接入指南

> 官方来源：<https://doc.dandanplay.com/open/>  
> 本地整理日期：2026-08-27。额度、权限和使用约定可能变化，关键发布决策应回查官方页面。

## 1. 基本概念与服务

- **番剧/作品**：一部动画、电视剧或电影；同一动画的多个季度在数据库中视为不同番剧。
- **节目**：番剧中的某一集，也可以是剧场版等单个节目。
- **弹幕库**：每个节目对应一个弹幕库；同内容的不同视频文件可以关联到同一弹幕库。
- **`episodeId`**：64 位整数，同时称“弹幕库 ID”或“节目编号”。

开放网络提供弹幕收发、文件识别、搜索、番剧信息、首页推荐、排行榜、关注、播放历史和用户账户能力。

## 2. 地址与应用凭证

- 官方 API 根地址：`https://api.dandanplay.net`
- API 版本路径：`/api/v2`
- 在 <https://dev.dandanplay.com> 注册、验证邮箱并提交应用审核后获得 `AppId` 和两个 `AppSecret`。
- 凭证泄露或被滥用可能导致应用停用。不要提交、打印或发送真实密钥。

## 3. 应用身份验证

官方支持两种模式；所有请求都要携带应用身份信息。

### 签名验证模式（客户端推荐）

请求头：

```text
X-AppId: <应用 ID>
X-Timestamp: <当前 UTC Unix 秒>
X-Signature: <Base64 SHA-256 签名>
```

签名算法：

```text
base64(sha256(AppId + Timestamp + Path + AppSecret))
```

其中 `Path`：

- 以 `/` 开头，仅包含域名之后的路径；
- 不包含协议、域名和 `?` 后的查询参数；
- 区分大小写，官方建议全部使用小写；
- 示例 URL `https://api.dandanplay.net/api/v2/comment/123450001?withRelated=true` 的签名路径是 `/api/v2/comment/123450001`。

JavaScript/TypeScript 参考实现（不要把真实密钥放进 Renderer）：

```ts
async function createSignature(
  appId: string,
  timestamp: number,
  path: string,
  appSecret: string,
): Promise<string> {
  const source = new TextEncoder().encode(`${appId}${timestamp}${path}${appSecret}`)
  const digest = await crypto.subtle.digest('SHA-256', source)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
}
```

设备时间必须与标准时间同步，否则会被判定为无效时间戳。

### 凭证模式（能安全保管密钥的服务端）

```text
X-AppId: <应用 ID>
X-AppSecret: <应用密钥之一>
```

不要在移动端、桌面 Renderer 或纯前端中使用该模式。Marchen Player 应优先由代理保存密钥并转发请求。

## 4. 用户身份与权限

接口分为：

- **公开接口**：文件识别、搜索、获取弹幕等，不要求用户登录，但仍需应用身份。
- **受限接口**：关注、播放历史、发送弹幕及用户资料等，需要 `Authorization: Bearer <JWT>`。

官方接入页截至本快照日期说明：新应用默认可访问公开接口，受限接口暂不开放申请。不要仅因为 Swagger 中存在接口就假定当前应用有调用权限。

## 5. 错误处理

业务错误可能以 HTTP 200 返回：

```json
{
  "success": false,
  "errorCode": 1,
  "errorMessage": "服务器内部错误"
}
```

因此必须同时判断 HTTP 状态与响应体。

- `401 Unauthorized`：调用受限接口时缺少必要用户身份。
- `403 Forbidden`：可能缺少应用身份头、时间戳无效、AppId/AppSecret 无效、签名不匹配或 IP 被屏蔽。
- 403 的细节可能位于响应头 `X-Error-Message`：
  - `Missing Authentication Headers`
  - `Invalid Timestamp`
  - `Invalid AppId`
  - `Invalid Signature`
  - `Invalid AppSecret`

## 6. 标准客户端调用流程

1. 打开视频时调用 `POST /api/v2/match`。
2. `fileHash` 是文件前 16 MiB（`16 * 1024 * 1024` 字节）的 MD5；同时传文件名、完整文件字节数和视频时长。
3. 让用户在候选项中确认正确节目，保存视频与 `episodeId` 的关联。
4. 匹配结果不正确时，通过搜索接口手动选择节目。
5. 使用 `GET /api/v2/comment/{episodeId}` 获取弹幕；`withRelated=true` 会整合第三方来源，服务端已处理其时间偏移。
6. 用户发送弹幕时使用 `POST /api/v2/comment/{episodeId}/app`，并先确认应用和用户权限。

## 7. 缓存与调用约束

- 按用户实际操作按需调用，禁止批量下载弹幕、规模化抓取数据库、提交垃圾数据或污染弹幕库。
- 未经明确授权，不得把开放网络数据用于商业目的，也不能把弹幕能力作为付费功能或主要收费卖点。
- 官方建议按 ID、关键词缓存番剧、节目、关联、搜索结果和弹幕：
  - 普通数据：2–6 小时；
  - 热门番剧更新日：约 0.5–1 小时；
  - 非当季热门番剧：12–24 小时；
  - 老番剧：2–7 天。
- 官方页面说明从 2026-06-25 起启用应用分层与额度管理，详情见 <https://dev.dandanplay.com/PublicPage/Quota>。
- 搜索、获取弹幕等高资源接口存在异常调用检测。业务确需高频访问时，应联系官方申请白名单。

## 8. 支持渠道

- 开发者中心留言：<https://dev.dandanplay.com>
- 官方开放网络 QQ 群（入口见官方接入页）
- 邮件：`kaedei@dandanplay.net`，官方建议标题写“弹弹play开放弹幕网络咨询”，并附应用名称、问题和联系方式。

