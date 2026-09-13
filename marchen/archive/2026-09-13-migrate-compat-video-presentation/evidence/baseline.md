# 基线与边界

2026-09-12，feat/player-engine。既有 player.css 修改及独立实验脚本属于本轮前 WIP，保留。正式实现开始前未修改主播放器。

本目录 *-experiment.json 是独立实验的结果，不是正式入口验收。用户确认 HEVC/AV1 HDR 高光、停帧保持亮度，并确认 HEVC WASM → video 可播放；软解专业色准与长期同步没有被证明。

删除主播放 Canvas DOM 与 CanvasFrameRenderer 依赖；frame-tools.ts 仍用画布生成预览，因此将其 renderer 改名为 PreviewFrameRenderer 并移入 preview 目录，保留共享 hdr-sdr 渲染用于 SDR 缩略图。字幕 libass 的 Canvas、media/frame-tools 的裁剪画布和历史色彩实验保持独立。

需迁移：native/canvas 内核枚举、playerSettingAtom 旧偏好、能力提示、telemetry engine 字段、NativePlayer 表面、字幕尺寸来源。
