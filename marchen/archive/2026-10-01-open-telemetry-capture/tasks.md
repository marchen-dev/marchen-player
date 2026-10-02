## 背景

`rebuild-observability-stack` 的原意是尽量完整上报以保留排障上下文，后续远程视频、下载变更又逐步加回了 URL 脱敏与组件级屏蔽。本次按用户决定彻底放开：PostHog 与 Sentry 不再做任何隐私屏蔽或脱敏（包括 URL、token、本地路径、输入框内容），只保留出于性能原因的弹幕层回放屏蔽，以及防止 payload 过大 / 循环引用的有界处理。

- 视频、字幕、canvas 缩略图在 rrweb 中本来就录不到像素；时间轴缩略图是 `blob:` 地址，放开不增加回放体积。
- 时间轴轨道与进度圆点一并放开（mutation 频率远低于弹幕）。
- `sanitize.ts` 只保留截断与循环保护，改名为有界处理，避免被误认为承担脱敏职责。
- Media Gateway 已下线，相关正则与 span 过滤为死代码；`diagnostics.ts` 无调用方。
- Sentry 服务端 Data Scrubber 需在后台手动关闭，代码无法覆盖，写入 runbook。

## 1. 移除脱敏

- [x] 1.1 删除 `packages/shared/src/media/redact.ts` 及 Sentry（Main / Renderer / Replay）与 PostHog `before_send` 中的 `redactMediaAddresses` 钩子
- [x] 1.2 将 `sanitize.ts` 改为只做长度、深度、数组、键数与循环引用限制的 `bound.ts`，去掉 URL / secret key 过滤，更新 Sentry client 调用与导出
- [x] 1.3 删除 Media Gateway 死代码（`isNoisyGatewayMediaRequest` 与 `shouldCreateSpanForRequest`）和无调用方的 `src/main/telemetry/diagnostics.ts`
- [x] 1.4 同步更新相关测试（telemetry.test、remote-media.test、operational-errors.test）

## 2. 移除屏蔽

- [x] 2.1 删除全部 `ph-no-capture` 与除弹幕层外的 `data-telemetry-replay-block` 标记，弹幕层改用语义清晰的性能屏蔽注释
- [x] 2.2 Sentry Replay 显式设置 `maskAllInputs: false`；Sentry breadcrumb 只按弹幕屏蔽标记忽略

## 3. 文档

- [x] 3.1 重写 `docs/observability-runbook.md` 中的隐私承诺，补充 Sentry 服务端 Data Scrubber 需在后台关闭
- [x] 3.2 在 `CLAUDE.md` 与 `AGENTS.md` 补充上报规范

## 4. 验证

- [x] 4.1 运行 typecheck、lint 与遥测相关测试
