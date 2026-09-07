# 实施基线

核对日期：2026-09-06。分支 feat/player-engine，HEAD 8ce47f27ad82181de6ee7031a0b11e7ef43fc5d5，与旧转码快照一致。无 worktree；相关旧开发任务均 idle。开始实施前只有新 change 文件与已授权的 register-schemes.ts bypassCSP=false 变更。

| 范围 | 处理 |
| --- | --- |
| packages/playback-core、player-loading、danmaku-engine | 保留业务核心，扩展引擎契约 |
| renderer services/player-runtime 宿主、platform、subtitles、history | 替换 video/HLS 假设，保留业务 |
| main modules/media-gateway（含 113 个 gateway/ffmpeg 文件范围） | 关口通过后删除 HLS 生产和专属服务，原文件读取独立替代 |
| main modules/ffmpeg 与 lib/ffmpeg、ipc/player | 拆分辅助用途；截图/字幕/probe 替代后删除重复实现 |
| renderer compatibility planner、HLS adapter、generation | 新入口验证后删除 |
| database、settings | 新来源/轨道模型与内核偏好，不兼容旧记录 |
| telemetry、library、UI | 保留功能，适配事件和状态，不按旧目录一并删除 |
| protocols、register-schemes、bootstrap、windows/main | 受控应用/媒体来源及生命周期，移除旧 HTTP Gateway |
| package/lockfile、构建、脚本、测试 | 同步新依赖与资源，删除 HLS 专属内容 |

旧分支不删除、不推送。本清单不代表旧 WIP 已通过验收。
