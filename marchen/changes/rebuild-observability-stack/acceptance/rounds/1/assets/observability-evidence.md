# 验收证据摘要

## 实际 Sentry 映射

| Runtime | Release / dist | Issue / Event | 原始源码 frame |
| --- | --- | --- | --- |
| Web Renderer | `Marchen@0.1.0+173e45a69f4b` / `web` | `MARCHEN-PLAYER-7M` / `b6bfc67e6dee4084806a39c15303e7e2` | `src/renderer/src/main.tsx:13:6` |
| Electron Main | 同 release / `darwin-arm64` | `MARCHEN-PLAYER-7S` / `9d74b2ff2129a4ac015a066a134ff3b8` | `src/main/index.ts:8:1` |
| Electron Preload | 同 release / `darwin-arm64` | `MARCHEN-PLAYER-7R` / `cc788d72414be0a4fdaa822dbf682da8` | `src/preload/index.ts:3:1` |
| Electron Renderer | 同 release / `darwin-arm64` | `MARCHEN-PLAYER-7T` / `12c2c67224b7d95f10e73f3930831df9` | `src/renderer/src/main.tsx:3:1` |

## Web SDK

- Sentry envelope：HTTP 200。
- PostHog `/flags/`：HTTP 200。
- PostHog `/i/v0/e/`：HTTP 200。
- CSP 允许必要的 HTTPS connect 与 blob worker，页面正常渲染。

## 兼容播放与事件量

- 样本：60.145 秒 HEVC Main10 + EAC-3 5.1。
- 20 秒窗口播放到 15.85 秒，`readyState=4`，无媒体错误。
- 20 个 Gateway segment、1 个 manifest；稳定播放 10 秒只有 2 个 PostHog `/s/` Replay 分块。
- Renderer `TaskDuration` 1078.538 ms / 20 秒（约 5.39%）；JS heap 约 +1.55 MB。
- 播放器有 4 个 Replay 隔离区域，覆盖视频、弹幕、字幕和时间轴。

## 可交付口径

- `docs/observability-runbook.md`：活跃安装、1/7/30 日留存、漏斗、功能使用率、fallback/失败率、Sentry 查询与故障处理。
- `scripts/verify-observability-build.mjs`：release/dist、Token、Source Map 和 Web/Electron SDK 边界门禁。
- `.github/workflows/release.yml`：多平台与 Web artifact 完成后单点 finalize、deploy 和 GitHub Release。
