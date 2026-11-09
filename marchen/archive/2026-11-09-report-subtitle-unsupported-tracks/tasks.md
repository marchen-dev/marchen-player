## 背景

字幕「不支持」目前几乎没有遥测。被判为不支持的内嵌轨在面板里置灰，也不会参与自动选轨，所以从不进入上报链路。zlib 压缩轨修复前在 Sentry 和 PostHog 里都没有记录，PGS、加密轨、WebVTT 等格式同样如此，无法评估需求量。另外，`matroska.ts` 和 `resolve.ts` 抛的是普通 Error，`subtitle_failed.reason` 基本都是 `unknown`；Sentry 又只按阶段聚合，内嵌字幕的各类失败会合并成同一个 issue。

方案：
1. 轨道列表生成时，每个不支持的内嵌轨发一次 PostHog 事件 `subtitle_track_unsupported`，属性为枚举化的 codec、不支持原因和容器。同一媒体同一轨道在一次会话内只发一次。它表示能力边界，不进 Sentry，也不列为关键事件。
2. 内嵌字幕解析错误改为抛带稳定原因码的 `SubtitleError`，并扩充 `SubtitleFailureReason`。Sentry fingerprint 加入 reason，让同一类失败归到同一个 issue。
3. 外挂字幕乱码检测依赖编码探测，不在本次范围。

## 1. 原因码

- [x] 1.1 扩充 `SubtitleFailureReason`（container_invalid / block_invalid / event_invalid / text_encoding / decompress_failed / track_missing），并给 `EmbeddedSubtitleTrack` 增加稳定的 `unsupportedCode`（codec / encrypted / compression_algo / multi_encoding / time_scale）
- [x] 1.2 `matroska.ts` 中会逃出到调用方的错误改为 `SubtitleError`（只在内部消化的索引路径和附件预检保持原样），UTF-8 解码失败归为 text_encoding；`resolve.ts` 同步处理
- [x] 1.3 `reportSubtitleFailure` 的 fingerprint 改为按阶段加原因聚合

## 2. 不支持轨道事件

- [x] 2.1 在 `contracts.ts` 声明 `subtitle_track_unsupported`，在 `telemetry/subtitles.ts` 实现 codec 枚举映射与会话内去重的上报函数
- [x] 2.2 `embedded-catalog.ts` 生成列表时调用该上报函数，遥测失败不影响列表

## 3. 测试与文档

- [x] 3.1 补充 matroska 原因码、unsupportedCode、遥测映射与去重、fingerprint 的测试
- [x] 3.2 更新 `docs/observability-runbook.md` 的字幕口径（新增原因、新事件、fingerprint 变化）
- [x] 3.3 运行 `pnpm test:player-runtime`、`pnpm typecheck`、eslint
