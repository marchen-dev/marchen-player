## 背景

`ApiRouteClient`（`src/renderer/src/request/api-route-client.ts`）负责自动模式下的线路调度，当前行为：

- 首选线路固定从 Cloudflare 开始；串行尝试，首选线路以可降级错误失败或超时（Cloudflare 8 秒、EdgeOne 10 秒、弹幕 10 秒）后，才请求另一条线路。
- 降级成功后在内存中把 EdgeOne 设为首选，5 分钟后通过 `cooldown_expired` 无条件切回 Cloudflare；不跨启动保留。
- 通过 `revision` 防止并发轮次或设置变化之后的迟到结果覆盖新状态。
- `ApiRouteObserver` 把 `changed` / `completed` / `recovered` / `failed` 接到遥测（`api-route.ts`），`failedRequests` WeakSet 供 TanStack Query 判断不再重试。

`ofetch.ts` 通过 `request(path, method, send, control)` 调用它，`send(route, signal)` 内部完成签名与单次尝试内的 `signature_expired` 纠偏。

2026-11-09 的排查表明大陆用户的瓶颈在用户到 CF 边缘的跨境链路；EdgeOne 线路已经过日本中转，在 CF 东京执行 Worker。本设计只改客户端调度，不改代理与签名。

## 目标与非目标

**目标：**

- 自动模式下，首选线路慢时在 1.5 秒（弹幕 2.5 秒）后让另一条线路参与，取先返回的结果。
- 学习"在这台设备上哪条线路更快"，并跨启动保留；新用户按时区给出合理的初始猜测。
- 遥测能区分"被对冲超过"和"真实失败"，能按首选线路来源分析效果。
- 对外接口（`request()` 签名、`getPreferred` / `subscribe` / `setMode`、`isApiRequestFailure`）保持不变，调用方无需修改。

**非目标：**

- 不修改 dandan-proxy、签名规范或 CORS 预检行为。
- 不做启动时的主动测速探测；不在服务端做 geo 分流。
- 不改变手动模式的语义，不新增设置项。
- 不对非匹配接口的写请求做重放。

## 决策

### 1. 调度：首发 → 延迟对冲 → 先到者胜

每一轮维护最多两个尝试（每条线路一次），每个尝试有独立的 `AbortController` 与超时计时器，并监听外部 `control.signal`。

- 发出首选线路的尝试，同时启动对冲计时器（`hedgeDelayMs(endpoint)`：`comment` 2500，其余 1500）。
- 对冲计时器到期、且首选尝试仍在进行 → 发出备用尝试，`trigger='hedge'`。
- 首选尝试在对冲之前以可降级错误结束 → 清除对冲计时器，立即发出备用尝试，`trigger='failover'`。
- 任一尝试以**不可降级结果**结束（HTTP 200 含业务失败、除 408 外的 4xx）→ 该结果即本轮结果，abort 其他进行中的尝试并标记 `superseded`。
- 一个尝试以可降级错误结束、另一个仍在进行 → 继续等待。
- 所有已发出的尝试都以可降级错误结束、且没有可再发出的尝试 → 以最后结束的错误失败。

用一个 Promise 驱动的小状态机实现（`settled` 标志 + `pending` 计数），而不是 `Promise.any`：`Promise.any` 无法表达"不可降级的错误要立即胜出"和"首选失败时立即触发备用"。

不可重放的请求（`canReplay=false`）和手动模式：不启动对冲计时器，也不做 failover，只有一个尝试。

**为什么对冲延迟是 1.5 / 2.5 秒：** 低峰时 CF 直连从上海请求 match 的端到端耗时约 1.3–2.0 秒，取 1.5 秒会让大陆用户在 CF 慢时尽早对冲，又不会让海外正常用户（通常 1 秒内）频繁对冲。弹幕在源站未命中缓存时，Worker 内部就要 1.0–1.4 秒，所以放宽到 2.5 秒。数值集中在一个函数里，上线后按遥测调整。

### 2. 单次超时统一放宽

对冲取代了"短超时快速降级"的作用，`attemptTimeoutMs` 简化为只看接口：`comment` 25 秒，`match` 15 秒，其他 10 秒，与 `route` / `isLast` 无关。最坏情况下一轮的总耗时约为"对冲延迟 + 较慢线路的超时"，但只在两条线路都卡死时才会出现。

### 3. 首选线路的来源与学习

把"当前首选"拆成 `preferred` 与 `preferredSource`（`learned` / `timezone` / `default`；手动模式下为 `manual`）。

- 构造时注入一个 `RoutePreferenceStore` 接口（`load(): {route, updatedAt} | null`、`save(route, now)`、`clear()`），以及时区读取函数。客户端逻辑不直接接触 localStorage，便于测试。
- 自动模式的初始首选：未过期（7 天）的学习记录 → 大陆时区 → Cloudflare。时区用 `Intl.DateTimeFormat().resolvedOptions().timeZone`，集合为 `Asia/Shanghai`、`Asia/Chongqing`、`Asia/Harbin`、`Asia/Urumqi`、`Asia/Kashgar`、`PRC`；读取失败视为未知。
- 学习时机在轮次结束时判断：只有本轮发出过两个尝试，且有一个给出了不可降级的响应（success 或 business_error），才把它设为首选并 `save`。理由是只有同时比较过两条线路的结果才算证据。
- 刷新：只有一个尝试且成功、当前来源为 `learned`、且记录的 `updatedAt` 早于 1 小时 → `save` 刷新时间。这样持续可用的线路不会过期，写入频率也有上限。
- 删除 5 分钟冷却计时器和 `cooldown_expired` / `primary_recovered` 两个原因。线路切换的原因改为 `manual` / `hedge` / `failover`：`failover` 表示首选线路真实失败后另一条线路成功，`hedge` 表示首选线路只是慢，被另一条线路超过。
- `revision` 机制保留：学习写入前校验 `revision` 与模式仍是本轮开始时的快照，防止迟到结果覆盖用户的新选择或较新的学习结果。
- 手动模式不读也不写学习记录；切回自动时重新执行初始首选的计算。

存储实现放在 `api-route.ts`：`localStorage` 键为 `marchen:api-route-preference`（与 `getStorageNS` 的命名一致，但直接写死：`lib/ns` 经 telemetry / 数据库会绕回请求层，形成循环依赖），值为 `{ v: 1, route, updatedAt }`。读写都包在 try/catch 里，存储不可用时降级为只在内存中生效。Web 端重置调用 `localStorage.clear()`，会一并清除；Electron 的重置走主进程 `windowAction('reset')`，需要在实现时确认它会清空 renderer 的 localStorage，否则在 renderer 侧补一次 `clear()`。

**为什么用 localStorage 而不是 jotai 设置 atom：** 这是运行时学到的网络状态，不是用户偏好，不应该出现在设置里，也不需要响应式同步；同步读取能在第一个请求发出前就确定首选线路。

### 4. 遥测

`ApiAttempt` 增加：

- `trigger: 'initial' | 'hedge' | 'failover'`
- `started_at_ms`：相对本轮开始的毫秒数
- `result` 增加 `'superseded'`，此时 `error_code` 也为 `'superseded'`

`ApiRequestResult` 增加 `hedged: boolean` 与 `first_route_source`。`attempts` 按发起顺序排列。`http_status` / `error_code` 取决定本轮结果的那个尝试，不再是 `attempts.at(-1)`，因为对冲时最后发起的尝试未必是胜者。`recovered` 只在首选尝试以可降级错误真实失败、另一条线路成功时为 true，观察者的 `recovered` 回调随之只在这种情况下触发。

`ApiRouteChange.reason` 改为 `'manual' | 'hedge' | 'failover'`，`api_route_changed` 仍在关键事件 outbox 中。Sentry 的 `failed` 上报 fingerprint 使用决定结果的尝试的 `error_code`。

`docs/observability-runbook.md` 的「API 主备线路与请求口径」整节按新行为重写，并注明 `cooldown_expired` / `primary_recovered` 为历史取值。

### 5. 设置界面

`ApiRouteSetting` 当前展示 `apiPreferredRouteAtom`。自动模式下，首选线路现在可能是学到的或按时区猜测的，文案改为类似"自动（当前优先 EdgeOne）"，不暴露来源细节；不新增"重新测速"之类的按钮。

## 风险与权衡

- **额外请求**：对冲会让慢请求多发一次。只有超过对冲延迟才触发，且学到更快的线路后，对冲频率会下降。两条线路最终都打到同一个 Worker，CF 的请求数会小幅上升，可以通过 `hedged` 比例监控。
- **对冲延迟偏短时的抖动**：如果两条线路耗时接近，胜者可能来回切换，产生较多 `api_route_changed`。可接受，代价只是遥测事件变多；如果比例过高，再考虑加入"连续胜出 N 次才切换"的迟滞。
- **时区先验误判**：海外用户把系统时区设成上海，会先走 EdgeOne（大陆节点）。代价是第一轮多等一个对冲延迟，之后就会学到 Cloudflare。
- **match POST 的重放**：对冲会让同一个 match 请求同时到达 Worker 两次。match 无写入副作用，现有规则已经允许重放；其他 POST 不对冲。
- **签名过期纠偏**：在单次尝试内完成，两次尝试各自签名、各自纠偏，互不影响；时钟偏差仍保存在模块级状态中，两条线路共用。
- **测试改写量**：现有 `api-route-client.test.ts` 中有关冷却、"8 秒降级"、"备用 25 秒"的用例需要按新语义重写，并新增对冲时序用例（使用 fake timers）。
- **与历史数据的可比性**：`attempts` 的含义从"串行"变成"可能并行"，按 `attempt_count` 或 `final_route` 分析时，需要区分上线前后，并结合 `hedged` 字段。
