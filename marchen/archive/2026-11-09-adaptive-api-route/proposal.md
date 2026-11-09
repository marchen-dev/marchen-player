## 动机

大陆用户在晚高峰（约 18–23 点）频繁出现接口超时，Sentry 中 `FetchError` / `接口请求超时` 持续出现。2026-11-09 的排查结论：

- 慢在用户与 Cloudflare 边缘之间的跨境链路，而不是 Worker 或弹弹play 回源。上海电信直连 CF 被路由到伦敦（LHR），单次往返约 195ms，晚高峰丢包时 TCP 重传会把请求拖过 8 秒。
- 同一时段 HK / JP / SG 等地区的用户基本都在 1.5 秒内完成。PostHog 中 CF 首次尝试约 10% 超时，几乎全部来自 geoip 为 CN 的用户。
- EdgeOne 线路已改为经日本中转（`RELAY_URL=https://dandan-jp.suemor.com`），Worker 在 CF 东京执行，从上海请求 match 多数约 0.3–0.4 秒。

但客户端自动模式始终先走 Cloudflare，必须等 8–10 秒超时才降级到 EdgeOne，最坏一次 match 要 24 秒。降级成功后的记忆只在内存中保留 5 分钟，到期切回 Cloudflare，每次启动也从 Cloudflare 开始，所以大陆用户每个会话都要重新踩一次坑。

靠地理位置判断（时区、geo）不可靠：海外华人、开全局代理的国内用户都会被误判，而海外用户误走 EdgeOne（大陆节点）反而更慢。因此改为**按实测选择线路**：慢的时候并行试另一条线路，并记住在当前网络下更快的那条。

## 变更内容

- **对冲请求**：自动模式下，首选线路超过对冲延迟仍未返回时，并行向另一条线路发出同一请求，取先返回的结果，取消另一个。首选线路在对冲延迟之前就以可降级的错误失败时，立即发起备用线路，不再等待。
- **超时调整**：有了对冲，单次尝试不再需要用短超时快速降级，每次尝试统一使用按接口放宽后的超时。
- **持久化首选线路**：在实际同时比较过两条线路之后，把胜出线路写入本地存储，下次启动直接使用，并设有效期。取消"5 分钟后无条件切回 Cloudflare"的冷却；首选线路变慢时，由对冲自然纠正。
- **首次启动先验**：没有学习记录时，系统时区为中国大陆的用户默认先走 EdgeOne，其余用户先走 Cloudflare。
- **遥测**：`api_request_completed` 记录本轮是否对冲、首选线路的来源，以及每次尝试的发起时刻和"被对冲取消"的状态；`api_route_changed` 增加对应原因。被对冲超过不等于线路故障，不上报异常。
- **手动模式不变**：用户手动指定 Cloudflare 或 EdgeOne 时，只请求该线路，不对冲，也不改变学习结果。

## 能力

### 新增能力

- `api-route-hedging`：自动模式下的对冲请求、取消规则、单次尝试超时，以及对应的请求遥测口径。
- `api-route-preference`：首选线路的来源（学习记录、时区先验、默认）、学习与持久化规则、有效期，以及线路变化事件。

### 修改能力

无（现有主备降级行为此前没有沉淀为 spec，本次以新增能力描述替代后的完整行为）。

## 影响范围

- `src/renderer/src/request/api-route-client.ts`：请求调度从串行降级改为对冲；移除 5 分钟冷却；首选线路的初始化与学习。
- `src/renderer/src/request/api-route.ts`：注入持久化存储与时区先验；`recovered` 异常上报口径调整。
- `src/renderer/src/services/telemetry/contracts.ts`：`ApiRequestResult` / `ApiAttempt` / `ApiRouteChange` 字段扩展（类型由 api-route-client 导出）。
- `src/renderer/src/components/modules/shared/setting/ApiRouteSetting.tsx`：自动模式下展示的当前线路可能来自学习结果，文案需核对。
- 应用重置（`clearAllData`）需要一并清除学习到的首选线路。
- `src/renderer/src/services/player-runtime/tests/api-route-client.test.ts`：现有用例围绕串行降级和冷却，需要重写相关用例。
- `docs/observability-runbook.md`：「API 主备线路与请求口径」一节同步更新。
- 不涉及 dandan-proxy 代理仓库与签名规范；Web 与 Electron 行为一致。
