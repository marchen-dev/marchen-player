## 背景

- 所有弹弹play 请求都在 renderer 发出：`request/ofetch.ts` 的 `request()` 把每次线路尝试交给 `api-route-client.ts` 的 `request(path, method, send)`，`send(route, signal)` 内部调用 `ofetch(url, { baseURL, query | body })`。主进程不调用该 API。
- ofetch 在 `onRequest` 钩子之后才拼接 `baseURL`、`query` 并序列化 JSON 请求体，钩子里拿不到最终发出的 URL 与字节，无法在钩子中签名。
- dandan-proxy 侧规范（已上线，`report`）：签名串为 `v1\nMETHOD\npathname\n去掉签名参数后的原始查询串\n请求体 SHA-256 hex\n_ts\n_nonce`，HMAC-SHA256，base64url 无填充；时间窗口 ±300 秒；`enforce` 下失败返回 401 `{ error: 'signature_<结果>', serverTime }`。EdgeOne 原样转发查询串与请求体到 Cloudflare 校验。固定测试向量位于 dandan-proxy `tests/fixtures/sign-vectors.json`。
- 线路切换只在超时、网络错误、408、5xx 时发生；4xx（含 401）直接抛给业务层。
- 现有构建变量校验集中在 `api-route-config.ts`（构建脚本与 renderer 共用）和 `scripts/web/release-build.mjs`、`release.yml` 的必填列表。

## 目标与非目标

**目标：**
- Web 与桌面每次请求尝试都携带与代理一致的签名，代理日志可统计 `sign=valid` 比例并据此切换 `enforce`。
- 用户时钟偏差不影响 `enforce` 后的使用：一次纠偏重试即可恢复，并在会话内记住偏差。
- 正式构建不可能漏配密钥；PR、预览与本地开发不被签名配置阻塞。
- 请求 URL、查询参数序列化与请求体语义与现状保持一致，不新增预检。

**非目标：**
- 代理侧改动、切换 `enforce` 的时机与执行。
- 把密钥移到主进程或做真正的客户端身份认证（密钥必然随客户端分发）。
- 新增遥测字段；签名状态以代理日志为准。
- 移动端（`apps/mobile`）接入。

## 决策

1. **在 `send` 闭包内签名，而不是 ofetch 钩子或 `api-route-client`。**
   每次线路尝试都会调用 `send`，在这里签名天然满足"每次尝试重新签名"，签名与代理域名无关，两条线路通用。`api-route-client` 只负责线路编排与遥测，不感知签名，保持职责单一。ofetch 钩子在序列化之前执行，拿不到最终字节，排除。

2. **自行构造最终 URL 与请求体，再交给 ofetch 发送。**
   用 ufo 的 `withBase` / `withQuery`（与 ofetch 内部完全相同的函数）拼出 URL，再经 `new URL()` 解析，取解析后的 `pathname` 与 `search` 签名，最后把带签名参数的完整 URL 交给 ofetch（不再传 `baseURL` / `query`）。浏览器与 workerd 都遵循 WHATWG URL 规范，签名使用解析后的字符串可以避免两端规范化差异。POST 由我们 `JSON.stringify` 一次，对这串字节求哈希并原样作为请求体发送，显式设置 `Content-Type: application/json`。ufo 已是 ofetch 的依赖并在 lockfile 中，改为显式声明依赖，不引入新包版本。

3. **签名参数追加在原查询串之后。** 代理按参数名剔除签名参数并保留其余参数原始顺序与编码，追加位置不影响验签；放在末尾便于排查。`_nonce` 使用 16 字节随机数的 base64url，`_ts` 为修正偏差后的秒级时间。

4. **时钟纠偏在 `send` 内完成，且只重试一次。**
   捕获 401 且正文 `error === 'signature_expired'`、带数值 `serverTime` 时，计算 `serverTime - 本地秒数` 存为会话内偏差，立即重签重试一次。重试仍在同一次线路尝试内，共享该尝试的超时与取消信号，遥测仍记为一次尝试。其他 401 不重试。偏差只保存在内存，刷新页面或重启应用后重新学习。

5. **签名配置：构建注入，按构建类型决定是否必填。**
   新增 `VITE_API_SIGN_KID` / `VITE_API_SIGN_KEY`，由 `api-route-config.ts` 提供读取与格式校验（kid 限 `[A-Za-z0-9_-]`，二者须同时存在或同时缺省）。Web 正式构建（`release-build.mjs`）与桌面发行（`release.yml`）把二者加入必填列表；`build.yml`、`linux-preview.yml` 与本地开发缺省时返回"未配置"，renderer 不签名并 `console.warn` 一次。Web 用 `w1`，桌面用 `d1`，变量名相同、值由各自平台配置。

6. **测试向量复制进仓库并注明来源。** 将 dandan-proxy 的 `sign-vectors.json` 复制到客户端测试目录，测试断言请求体哈希、签名串、签名值逐项一致；两个仓库各自校验同一份契约。

## 风险与权衡

- **密钥公开**：打包进前端即可被提取，签名只提高门槛、支持按 kid 轮换和区分来源；在关闭旧版本与无 Origin 通道之前，对有意盗刷几乎没有防护。这是已知且接受的权衡。
- **URL 规范化差异**：若某些字符在浏览器与 workerd 中解析结果不同，验签会失败。通过"签解析后的字符串"规避，并用中文 / 日文、`%2F`、重复参数等用例覆盖；`report` 期观察 `sign=invalid` 比例兜底。
- **序列化行为变化**：改为自行拼 URL 与请求体后，若与 ofetch 原有行为不一致可能改变请求语义。复用 ufo 同一函数，并保持 JSON 请求头，降低风险。
- **时钟偏差超过窗口且无 serverTime**（如代理旧版本）：不重试，按普通 401 失败；当前代理已提供 serverTime。
- **桌面旧版本**不会签名，`SIGN_POLICY_DESKTOP` 需等旧版本流量下降后再切 `enforce`，不在本变更内。
- **本地开发**未配置密钥时，Web 切 `enforce` 后 localhost 请求会被拒；在 `.env.example` 与文档中提示配置 `w1`。
