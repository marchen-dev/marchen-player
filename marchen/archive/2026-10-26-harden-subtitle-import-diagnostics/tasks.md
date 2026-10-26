## 背景

用户反馈 MARCHEN-PLAYER-8P（「字幕显示不全」）关联的 MARCHEN-PLAYER-8N 两次 `SUBTITLE_IMPORT_FAILED`，但上报只有阶段，原始错误被丢弃，无法判断是读取失败还是解析失败；同时该用户 GPU 加速全部退回软件渲染，现有遥测无法统计此类用户占比。

方案：
- 字幕错误统一携带低基数失败原因（read_failed / not_downloaded / unsupported_format / too_large / vtt_header / timestamp_invalid / empty / unknown），`reportSubtitleFailure` 写入 Sentry context、tag 和 `subtitle_failed.reason`，仍不上报原始文案。
- SRT / VTT 解析容错：单个坏块跳过并记 warning，只有整份文件都无可用字幕时才失败；时间戳接受一位小时数、`,` / `.` 两种分隔和 1～3 位毫秒。
- 主进程按 `app.getGPUFeatureStatus()` 归纳 `gpu_acceleration`（hardware / partial / software），写入 app_start 日志、主进程 Sentry tag 和 `app_session_started` 属性。

## 1. 字幕失败原因分类

- [x] 1.1 新增 `SubtitleError`（带 `reason`）与原因类型，解析与转换预算错误改为抛出带原因的错误
- [x] 1.2 主进程 `readSubtitleText` 失败返回 `reason`，Electron / Web 外挂字幕读取按原因抛 `SubtitleError`
- [x] 1.3 `reportSubtitleFailure` 提取原因写入 context、tag 与 `subtitle_failed.reason`，更新事件契约与测试

## 2. SRT / VTT 解析容错

- [x] 2.1 放宽时间戳格式，坏块跳过并记录跳过数量 warning，全部无效时按原因失败
- [x] 2.2 补充解析容错单测

## 3. GPU 软件渲染标记

- [x] 3.1 新增 `resolveGpuAcceleration` 纯函数及单测
- [x] 3.2 写入 app_start 日志与主进程 Sentry tag
- [x] 3.3 经 `getTelemetryIdentity` 传到 renderer，`app_session_started` 携带 `gpu_acceleration`

## 4. 收尾

- [x] 4.1 更新 `docs/observability-runbook.md` 口径，运行 typecheck、lint 与相关测试
