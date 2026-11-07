## 动机

弹弹play API 经 dandan-proxy 代理访问（Cloudflare 主、EdgeOne 备，EdgeOne 已改为只转发到 Cloudflare）。代理用服务端持有的 AppId / AppSecret 回源，一旦被人当作免费的弹弹play 凭证盗刷，可能导致 AppId 被弹弹play 限流或封禁，两条线路同时失效。

dandan-proxy 已上线接口白名单、去除 `Origin: null`，并支持 HMAC-SHA256 请求签名校验（当前 `SIGN_POLICY_WEB` / `SIGN_POLICY_DESKTOP` 均为 `report`，只记录不拦截）。客户端尚未签名，日志中所有请求都是 `sign=missing`，代理无法区分自家客户端流量和其他调用，也无法切到 `enforce`。

客户端密钥会随前端代码分发，签名不是身份认证；它的价值是提高调用门槛、按 kid 轮换与区分来源，并为以后关闭旧版本通道、拒绝无 Origin 请求打基础。

## 变更内容

- Web 与 Electron 共用的 renderer 请求层在每次请求尝试前，按 dandan-proxy 的 v1 规范对最终发出的方法、路径、查询串和请求体签名，签名参数放在查询串（`_kid`、`_ts`、`_nonce`、`_sig`），GET 保持简单请求、不新增 CORS 预检。
- 代理返回 401 `signature_expired` 时，按响应中的 `serverTime` 修正会话内时钟偏差，重签后重试一次；不触发线路切换。
- 新增构建变量 `VITE_API_SIGN_KID` / `VITE_API_SIGN_KEY`：Web 正式构建使用 `w1`，桌面发行使用 `d1`；正式构建必填，PR / 预览构建与本地开发缺省时不签名并告警。
- 同步更新 `.env.example`、发行脚本与工作流必填检查、AGENTS.md 与发布 / 可观测性文档。

不在本变更范围：代理侧逻辑（已在 dandan-proxy 完成）、切换 `enforce`、限流与缓存扩展、移动端。

## 能力

### 新增能力
- `api-request-signing`：客户端 API 请求签名、时钟纠偏重试与签名配置约定。

### 修改能力

无。

## 影响范围

- `src/renderer/src/request/`：新增签名模块；`ofetch.ts` 改为自行构造最终 URL 与 JSON 请求体后签名；`api-route-config.ts` / `lib/env.ts` 读取签名配置。
- 构建与发行：`.env.example`、`scripts/web/release-build.mjs`、`.github/workflows/release.yml`（及其必填检查）；`build.yml`、`linux-preview.yml` 不注入。
- 文档：AGENTS.md（API 请求、环境变量）、`docs/web-edgeone-release.md`、`docs/desktop-release.md`、`docs/observability-runbook.md`。
- 外部配置（由维护者完成）：EdgeOne Web 构建变量、GitHub Repository Secrets、本地 `.env`。
- 依赖：仅使用 Web Crypto，不新增 npm 依赖。签名测试向量复用 dandan-proxy 的 `tests/fixtures/sign-vectors.json`。
