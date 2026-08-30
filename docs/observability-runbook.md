# Marchen 可观测性运行手册

## 事件与仪表盘口径

所有人数口径都按匿名 `install_id` 去重，不使用 PostHog 自动生成的 device ID。应用重置会生成新的 install ID，因此重置后的安装按新安装计算。

| 指标                    | PostHog 定义                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| DAU / WAU / MAU         | 在日 / 周 / 月窗口内触发 `app_session_started` 的唯一 `install_id`                                                                                   |
| 次日 / 7 日 / 30 日留存 | 以首次 `app_session_started` 为 cohort，分别观察第 1 / 7 / 30 日再次触发该事件的唯一安装比例                                                         |
| 启动到播放漏斗          | 同一 `app_session_id` 内依次出现 `app_session_started` → `video_import_completed` → `media_prepare_completed` → `playback_started`；建议窗口 30 分钟 |
| 功能使用率              | 窗口内触发指定 `feature_used.feature + action` 的唯一安装数 ÷ 同窗口活跃安装数                                                                       |
| 兼容 fallback 率        | 唯一 `operation_id` 的 `compat_fallback_triggered` 数 ÷ `media_prepare_completed` 数；按 `from`、`to`、`reason` 分组                                 |
| 播放失败率              | 唯一 `operation_id` 的 `playback_failed` 数 ÷ `video_import_started` 数；按 `error_code`、`mode`、`app_target`、`platform` 分组                      |
| 首帧耗时                | `playback_started.time_to_first_frame_ms` 的 P50 / P75 / P95；按 `mode`、`dist` 分组                                                                 |
| 卡顿质量                | 每次播放的 `playback_ended.stall_count`、`stall_duration_ms` 与 `watched_ms`；显著卡顿阈值为 1 秒                                                    |

关键漏斗事件经过独立 outbox 补发，并用 `$insert_id` 去重。Replay、autocapture 和高频 UI 信号不进入 outbox。Gateway 分片只汇总在 Sentry generation span，不得建立逐分片 PostHog insight。

## Sentry 推荐查询

Issue 查询优先使用低基数标签：

```text
release:Marchen@<version>+<commit>
dist:web | dist:darwin-arm64 | dist:darwin-x64 | dist:win32-x64 | dist:linux-x64
runtime:main | runtime:preload | runtime:renderer
error_code:PLAYER_* | error_code:FFMPEG_* | error_code:GATEWAY_*
```

播放器性能在 Trace Explorer 中按 `span.op` 查询：

```text
player.loading
player.danmaku
player.prepare
media.generation
```

`media.generation` 的 span attributes 包含 `mode`、`generation`、`encoder_class`、`segment_count`、`produced_duration_s`、`bytes_written`、`startup_ms` 和 `end_reason`。这些是 span 属性，不建立高基数 issue tag。

详细文件路径、FFmpeg 命令、输入路径和有界 stderr 只放在失败 issue 的 `diagnostics` context；完整错误步骤放 `operation` context。路径、命令、URL、Gateway token、stderr 和 attachment 禁止进入 tag 或 PostHog 产品事件。

## 发布与 Source Map

客户端运行时变量：

```text
VITE_SENTRY_DSN
VITE_POSTHOG_KEY
VITE_POSTHOG_HOST
```

构建期变量（不得使用 `VITE_` 前缀）：

```text
SENTRY_AUTH_TOKEN
SENTRY_ORG
SENTRY_PROJECT
SENTRY_RELEASE
MARCHEN_DIST
MARCHEN_COMMIT
```

本地无构建认证时仍生成 hidden Source Map 并注入 Debug ID，但跳过上传。Tag 发布必须完整提供所有变量；任一平台上传失败都会阻断协调 job。Main、Preload、Renderer、Web artifact 全部上传后，协调 job 才设置 commits、finalize release、登记 production deploy、部署 Web 并创建 GitHub Release。

产物门禁：

```bash
node scripts/verify-observability-build.mjs \
  --root out/web \
  --target web \
  --expected-release "$SENTRY_RELEASE" \
  --expected-dist web \
  --require-no-maps
```

门禁会检查 release/dist、残留 `.map`、认证 Token 泄漏，以及 Web bundle 是否误带 Electron Sentry SDK。

## 本地诊断

开发环境默认不上报。只在验收窗口用进程级变量临时开启，不要写回 `.env`：

```bash
VITE_TELEMETRY_DEBUG=true pnpm dev
VITE_TELEMETRY_DEBUG=true pnpm dev:web
```

依次核对：应用会话、稳定 page view、Feature Flag、本地产品事件、错误 Replay、离线 outbox 恢复、Main / Preload / Renderer / Web 受控异常。验证完成后结束进程即可恢复关闭状态。

## 故障判断

- 没有 DSN 或 PostHog Key：应用必须正常启动，遥测降级为空实现。
- 没有构建 Token：本地构建明确跳过上传；正式 Tag workflow 必须失败。
- Issue 仍显示压缩行号：先核对 event 的 `release + dist + debug_id` 与 artifact，再查协调 job 是否晚于所有上传执行。
- Web 无事件：先看 CSP、广告拦截和 PostHog/Sentry ingestion 请求；Electron PostHog 禁止远端扩展依赖。
- 播放事件重复：按 `operation_id + attempt_id + generation` 检查，迟到 prepare、Strict Effects 和 ready/reloading 不应新增漏斗事件。
