## 1. 签名配置

- [x] 1.1 在 `api-route-config.ts` 新增签名配置读取：`VITE_API_SIGN_KID` / `VITE_API_SIGN_KEY` 同时存在或同时缺省，kid 限 `[A-Za-z0-9_-]`，错误只指出变量名；`lib/env.ts` 导出读取结果
- [x] 1.2 `package.json` 显式声明已在 lockfile 中的 `ufo` 依赖（与 ofetch 使用的版本一致），确认 lockfile 无新增下载

## 2. 签名模块

- [x] 2.1 新增 `request/sign.ts`：签名串拼接、请求体 SHA-256 hex、HMAC-SHA256 base64url、随机 nonce、会话内时钟偏差读写，仅用 Web Crypto
- [x] 2.2 复制 dandan-proxy `tests/fixtures/sign-vectors.json` 到客户端测试目录并注明来源；编写测试断言请求体哈希、签名串、签名值与向量逐项一致

## 3. 请求层接入

- [x] 3.1 `ofetch.ts` 的 `send` 闭包改为用 ufo `withBase` / `withQuery` 构造 URL、`new URL()` 解析后签名并追加签名参数；POST 自行 `JSON.stringify` 并设置 `Content-Type: application/json`；未配置密钥时保持原样且只告警一次
- [x] 3.2 在 `send` 内处理 401 `signature_expired`：读取 `serverTime` 更新偏差，重签重试一次；其他 401 与重试后失败直接抛出，不触发线路切换
- [x] 3.3 测试：GET 查询参数（中文 / 日文、`%2F`、重复参数）与 POST 请求体签名可被参考实现验签；每次线路尝试使用新的 nonce；纠偏重试仅一次且后续请求沿用偏差；非 expired 的 401 不重试；未配置时不带签名参数且 URL / 请求体与原行为一致
- [x] 3.4 将新测试纳入 `vitest.player-runtime.config.ts`，运行 `pnpm test:player-runtime` 与 `pnpm typecheck`

## 4. 构建与发行

- [x] 4.1 `.env.example` 增加两个变量及说明（本地建议配置 Web 的 `w1`）
- [x] 4.2 `scripts/web/release-build.mjs` 必填列表加入两个变量并做格式校验，补充 `release.test.mjs` 用例
- [x] 4.3 `.github/workflows/release.yml` 从 Repository Secrets 注入两个变量并加入必填检查；`build.yml`、`linux-preview.yml` 保持不注入

## 5. 文档

- [x] 5.1 AGENTS.md「API 请求」说明请求签名、kid 约定与时钟纠偏，「环境变量」表新增两个变量
- [x] 5.2 `docs/web-edgeone-release.md`、`docs/desktop-release.md` 补充签名变量配置（Web `w1` / 桌面 `d1`）
- [x] 5.3 `docs/observability-runbook.md` 说明签名失败表现为 401、如何在 Cloudflare Workers Logs 按 `sign` / `origin_class` / `client_version` 排查

## 6. 验证

- [x] 6.1 运行 `pnpm lint`、`pnpm typecheck`、`pnpm test:player-runtime`、Web 发行脚本测试
- [x] 6.2 本地配置 `w1` 后用 `pnpm dev:web` 实际播放并匹配一集，用 `wrangler tail` 确认请求为 `sign=valid`；Electron 开发环境同样验证
