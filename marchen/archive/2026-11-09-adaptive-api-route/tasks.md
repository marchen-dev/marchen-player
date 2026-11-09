## 1. 类型与遥测契约

- [x] 1.1 在 `api-route-client.ts` 扩展 `ApiAttempt`：新增 `trigger`、`started_at_ms`，`result` 与 `error_code` 增加 `superseded`
- [x] 1.2 扩展 `ApiRequestResult`：新增 `hedged`、`first_route_source`；`http_status` / `error_code` 改为取决定本轮结果的尝试
- [x] 1.3 `ApiRouteChange.reason` 改为 `manual` / `hedge` / `failover`，移除 `cooldown_expired` / `primary_recovered`，确认 `contracts.ts` 与 outbox 编译通过

## 2. 首选线路来源与学习

- [x] 2.1 定义 `RoutePreferenceStore` 接口与时区读取注入点，`ApiRouteClient` 构造参数接收它们（默认实现为内存版，便于测试）
- [x] 2.2 实现初始首选计算：未过期（7 天）的学习记录 → 大陆时区集合 → Cloudflare，并记录 `preferredSource`；读取异常回退为默认
- [x] 2.3 删除 5 分钟冷却计时器；`setMode` 切回自动时重新计算初始首选，手动模式来源为 `manual`
- [x] 2.4 实现轮次结束时的学习：两条线路都尝试过且有不可降级响应 → 更新首选并保存；单尝试成功且来源为 `learned`、记录早于 1 小时 → 刷新时间；保留 `revision` 校验
- [x] 2.5 首选变化时按 `hedge` / `failover` / `manual` 发出 `changed`，启动恢复不发事件

## 3. 对冲调度

- [x] 3.1 新增 `hedgeDelayMs(endpoint)`（`comment` 2500，其余 1500），`attemptTimeoutMs` 简化为只按接口区分（25 / 15 / 10 秒）
- [x] 3.2 重写 `request()` 的调度：首发 + 对冲计时器 + 首选提前失败立即 failover；每个尝试独立的 AbortController 与超时，统一监听外部 signal
- [x] 3.3 实现结果判定：不可降级结果立即胜出并取消其他尝试（标记 `superseded`）；可降级错误在另一尝试进行中时继续等待；全部失败以最后结束的错误失败
- [x] 3.4 不可重放请求与手动模式只发一个尝试，不启动对冲计时器
- [x] 3.5 外部取消时 abort 全部尝试、清理计时器，结果为 `cancelled`，不学习、不上报异常
- [x] 3.6 组装 `api_request_completed`：`hedged`、`first_route_source`、按发起顺序的 `attempts`；`recovered` 只在首选真实失败后另一条成功时为 true，观察者 `recovered` 回调同步收紧

## 4. 接入与界面

- [x] 4.1 在 `api-route.ts` 实现 localStorage 版 `RoutePreferenceStore`（键 `marchen:api-route-preference`，直接写死而不引入 `lib/ns` 以避免循环依赖，值 `{ v: 1, route, updatedAt }`，读写 try/catch），注入时区读取
- [x] 4.2 `failed` 上报的 `errorCode` / fingerprint 改用决定结果的尝试，而不是 `attempts.at(-1)`
- [x] 4.3 确认 Electron 重置（`windowAction('reset')`）会清空 renderer localStorage；不会的话在重置流程中补充清除学习记录
- [x] 4.4 核对 `ApiRouteSetting` 在自动模式下的"当前优先线路"文案，体现自动选择的结果

## 5. 测试

- [x] 5.1 改写 `api-route-client.test.ts` 中依赖冷却、8 秒降级、备用 25 秒等旧语义的用例
- [x] 5.2 新增对冲时序用例（fake timers）：及时返回不对冲；1500ms 对冲且备用先到；对冲后首选先到；弹幕 2500ms；首选提前失败立即 failover；对冲后一条失败继续等待另一条；401 / 业务失败立即结束；两条都失败只失败一次；不可重放请求与手动模式不对冲；对冲期间取消
- [x] 5.3 新增首选线路用例：时区先验（大陆 / 香港）、学习记录优先、过期记录忽略、对冲胜出后学习并持久化、单尝试不切换、1 小时刷新节流、存储异常降级、手动模式不写记录、迟到结果不覆盖、启动恢复不发 `changed`
- [x] 5.4 新增遥测用例：`superseded`、`trigger`、`started_at_ms`、`hedged`、`first_route_source`，以及被对冲超过时不触发 `recovered`
- [x] 5.5 运行 `pnpm test:player-runtime`、`pnpm typecheck`、`pnpm lint`

## 6. 文档与验证

- [x] 6.1 重写 `docs/observability-runbook.md`「API 主备线路与请求口径」：对冲规则、超时、学习与有效期、新字段与原因，注明历史取值
- [x] 6.2 同步更新 AGENTS.md 中「自动降级会话内记忆 5 分钟」的描述
- [x] 6.3 `pnpm dev:web` 下用 DevTools 节流或屏蔽一条线路，手动验证对冲、学习、重启后沿用、手动模式不对冲
