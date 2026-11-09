## 目的

决定自动模式下每一轮请求先走哪条线路：优先使用在当前设备上实测更快的线路，没有实测结果时按系统时区给出初始猜测，并在跨启动之间保留学习结果。

### 需求: 首选线路的来源与优先级

自动模式下，系统 SHALL 按以下顺序确定首选线路：

1. 未过期的学习记录（来源 `learned`）；
2. 没有学习记录时，系统时区属于中国大陆（`Asia/Shanghai`、`Asia/Chongqing`、`Asia/Chungking`、`Asia/Harbin`、`Asia/Urumqi`、`Asia/Kashgar`、`PRC`）则为 EdgeOne（来源 `timezone`）；
3. 其他情况为 Cloudflare（来源 `default`）。

香港、澳门、台湾时区 MUST NOT 被视为中国大陆时区。手动模式下首选线路即用户选择的线路（来源 `manual`）。

#### 场景: 大陆时区的新用户先走 EdgeOne

- **GIVEN** 没有学习记录，系统时区为 `Asia/Shanghai`
- **WHEN** 应用启动后发起第一轮请求
- **THEN** 首选线路为 EdgeOne，来源为 `timezone`

#### 场景: 香港时区的新用户先走 Cloudflare

- **GIVEN** 没有学习记录，系统时区为 `Asia/Hong_Kong`
- **WHEN** 发起第一轮请求
- **THEN** 首选线路为 Cloudflare，来源为 `default`

#### 场景: 学习记录优先于时区

- **GIVEN** 系统时区为 `Asia/Shanghai`，有未过期的学习记录指向 Cloudflare
- **WHEN** 应用启动后发起请求
- **THEN** 首选线路为 Cloudflare，来源为 `learned`

#### 场景: 无法读取时区或存储时回退

- **GIVEN** 读取时区或本地存储抛出异常
- **WHEN** 发起请求
- **THEN** 首选线路为 Cloudflare，来源为 `default`，请求照常进行

### 需求: 只在实际比较两条线路后学习

自动模式下，一轮请求中两条线路都被尝试过（对冲或降级），且其中一条线路给出有效响应（HTTP 200，含业务层失败）时，系统 SHALL 把这条线路作为新的首选线路，并持久化为学习记录。只请求了一条线路的轮次 MUST NOT 改变首选线路。被取消的轮次、两条线路都失败的轮次、以 401 / 404 等拒绝结束的轮次 MUST NOT 改变学习结果。

#### 场景: 对冲胜出后切换首选线路

- **GIVEN** 首选线路为 Cloudflare（来源 `default`）
- **WHEN** 一轮请求对冲后 EdgeOne 先成功
- **THEN** 首选线路变为 EdgeOne，并写入学习记录
- **AND** 之后的请求先走 EdgeOne，来源为 `learned`

#### 场景: 首选线路被对冲后仍胜出

- **GIVEN** 首选线路为 EdgeOne
- **WHEN** 一轮请求对冲后 EdgeOne 仍先成功
- **THEN** 首选线路保持 EdgeOne，学习记录的时间被刷新

#### 场景: 两条线路都失败不学习

- **GIVEN** 首选线路为 EdgeOne
- **WHEN** 一轮请求中两条线路都失败
- **THEN** 首选线路与学习记录都不变

### 需求: 学习记录跨启动保留并有有效期

学习记录 SHALL 在应用重启、页面刷新后保留，有效期为 7 天，自最后一次写入或刷新起算。首选线路在未对冲的情况下成功时，系统 SHOULD 刷新已有学习记录的时间，但同一记录 1 小时内最多刷新一次。过期或格式无效的记录 MUST 视为不存在。

#### 场景: 重启后沿用学习结果

- **GIVEN** 3 天前学到首选线路为 EdgeOne
- **WHEN** 重启应用后发起请求
- **THEN** 首选线路为 EdgeOne，来源为 `learned`

#### 场景: 学习记录过期

- **GIVEN** 学习记录最后刷新于 8 天前
- **WHEN** 应用启动
- **THEN** 忽略该记录，按时区先验或默认选择首选线路

#### 场景: 持续可用的首选线路不会过期

- **GIVEN** 学习记录指向 EdgeOne，最后刷新于 6 天前
- **WHEN** 一轮请求只走 EdgeOne 且成功
- **THEN** 学习记录的时间被刷新为当前时间

### 需求: 取消无条件回切主线路的冷却

自动模式下，系统 MUST NOT 因为经过一段时间就把首选线路切回 Cloudflare。首选线路只因对冲或降级的比较结果、用户切换模式而改变。

#### 场景: 长时间使用 EdgeOne 不会被切回

- **GIVEN** 首选线路因对冲变为 EdgeOne
- **WHEN** 10 分钟后发起新请求，期间没有任何比较结果
- **THEN** 首选线路仍为 EdgeOne

### 需求: 手动模式与学习结果互不影响

用户切换到手动模式时，系统 SHALL 只请求所选线路，且 MUST NOT 改写学习记录；切回自动模式后，系统 SHALL 按学习记录、时区先验、默认的顺序重新确定首选线路。设置变化 MUST NOT 取消进行中的请求，较早轮次迟到的结果 MUST NOT 覆盖用户的新选择或较新的学习结果。

#### 场景: 手动模式不写学习记录

- **GIVEN** 学习记录指向 EdgeOne，用户切换到手动 Cloudflare
- **WHEN** 发起多轮请求
- **THEN** 学习记录仍指向 EdgeOne

#### 场景: 切回自动模式后沿用学习结果

- **GIVEN** 学习记录指向 EdgeOne，用户从手动 Cloudflare 切回自动
- **WHEN** 发起请求
- **THEN** 首选线路为 EdgeOne

#### 场景: 迟到的旧结果不覆盖新选择

- **GIVEN** 一轮自动模式请求进行中，用户切换到手动 Cloudflare
- **WHEN** 这轮请求随后对冲到 EdgeOne 并胜出
- **THEN** 首选线路仍为用户选择的 Cloudflare，学习记录不变

### 需求: 线路变化事件

首选线路实际发生变化时，系统 SHALL 发送一次 `api_route_changed`，原因为：`manual`（用户切换模式）、`hedge`（对冲比较后切换）或 `failover`（首选线路真实失败后另一条线路成功）。启动时从学习记录或时区先验确定首选线路不算变化，MUST NOT 发送该事件。

#### 场景: 对冲导致的切换

- **GIVEN** 首选线路为 Cloudflare
- **WHEN** 对冲后 EdgeOne 胜出
- **THEN** 发送一次 `api_route_changed`，from 为 cloudflare，to 为 edgeone，原因为 `hedge`

#### 场景: 启动恢复不发事件

- **GIVEN** 有指向 EdgeOne 的学习记录
- **WHEN** 应用启动
- **THEN** 不发送 `api_route_changed`

### 需求: 重置应用清除学习结果

用户重置应用数据时，系统 SHALL 清除学习记录，之后按时区先验或默认选择首选线路。

#### 场景: 重置后回到初始猜测

- **GIVEN** 学习记录指向 Cloudflare，系统时区为 `Asia/Shanghai`
- **WHEN** 用户重置应用后重新启动并发起请求
- **THEN** 首选线路为 EdgeOne，来源为 `timezone`
