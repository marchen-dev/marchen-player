## 背景

手动选择 EdgeOne 时，获取弹幕接口（`withRelated=true` 需服务端聚合第三方源）在 10 秒处被客户端超时中止，弹幕加载失败。手动模式只有一次尝试，没有备用线路兜底；超时计时覆盖整个请求含正文下载。

PostHog 数据：自动模式降级有效（90 天内 Cloudflare 2 次 8s 超时，均降级到 EdgeOne 约 2.5s 成功），未见其他用户因超时丢失弹幕；Cloudflare 一次成功的弹幕请求最慢 7.6s，贴近 8s 上限。

方案：后面还有备用线路时保持短超时以尽快降级，最后一次尝试（自动模式的降级尝试或手动模式的唯一尝试）按接口放宽。

| 接口 | 非最后一次 | 最后一次 |
| --- | --- | --- |
| comment | 10s（原 Cloudflare 8s） | 25s |
| match | 8s（不变） | 15s |
| 其他 | 不变（Cloudflare 8s / EdgeOne 10s） | 不变 |

降级条件、线路记忆、5 分钟冷却、可重放判断与遥测结构均不变。

## 1. 超时策略

- [x] 1.1 在 `request/api-route-client.ts` 新增按接口、线路与是否最后一次尝试选择超时的函数，替换写死的 8s / 10s
- [x] 1.2 在 `api-route-client.test.ts` 覆盖：非最后一次短超时、最后一次放宽、手动模式唯一一次放宽、其他接口不变

## 2. 文档与校验

- [x] 2.1 更新 `docs/observability-runbook.md` 线路超时口径
- [x] 2.2 运行 `pnpm test:player-runtime`、`pnpm typecheck` 与改动文件 lint
