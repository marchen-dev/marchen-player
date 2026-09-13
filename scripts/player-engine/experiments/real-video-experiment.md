> 迁移后此页面直接使用正式 CompatMediaAdapter + VideoFramePresenter，不再通过 Vite 替换 Canvas renderer。下面旧实验记录保留当时语境，`real-video-renderer.ts` 仅为历史实验实现，无生产引用。

# 真实文件 video 呈现实验

独立 Electron / Chromium 页面，复用正式 CanvasMediaAdapter、CanvasDecoderClient、decoder.worker、Web Audio 和 SoundTouch。仅在实验 Vite transform 中替换 frame-renderer 导入，不修改正式 src 实现，不接入字幕和弹幕。

## 启动

在项目根目录、Node 24 下执行：

```sh
node scripts/player-engine/experiments/real-video-experiment.mjs
node scripts/player-engine/experiments/real-video-experiment.mjs '/绝对路径/视频.mkv' --check
```

选择本地 mp4/mkv/webm，支持播放、暂停、拖动、前后跳转、倍速、音轨选择、关闭媒体和诊断导出。暂停调用现有适配器冻结媒体时间、Web Audio 与送帧，不调用 video.pause。主动 seek/倍速/换轨前重建视频轨道以丢弃旧轨道的显示队列。

`--software` 或页面勾选框在下次打开文件时强制使用既有 HEVC WASM 解码器；本次真实文件验证没有覆盖该模式。音量初始为 35%，视频元素静音，声音仅来自现有 Web Audio 链路。

仅监听 127.0.0.1；File 直接由页面和 Worker 本地读取，媒体不会上传。端口随机，关闭实验窗口结束服务。刷新页面后需要重新选择文件。

## 2026-09-12 本地结果

环境：Node 24.20.0，Electron 44 / Chromium 152.0.7977.54。显式移除 Playwright Electron loader 注入的 force-color-profile=srgb，并检查实际 renderer 进程参数确认已移除。

样本：本地《你的名字》3840×2160 HEVC / PQ / BT.2020，时长约 6397.7 秒，选中 Japanese DTS 音轨。全文件由既有解封装器按需读取，无预解码缓存整片。

| 检查              | 实测结果                                                |
| ----------------- | ------------------------------------------------------- |
| 初始播放          | WebCodecs 后端，音频输出 2 声道                         |
| 连续播放约 10 秒  | 时钟 2.02→12.05 秒，289 帧已提交且呈现                  |
| 暂停 4 秒         | 媒体时间与提交帧数冻结，video.paused=false，PQ 标签保留 |
| 暂停中跳转        | 媒体时间到 60 秒，video 呈现一次新帧，PQ 保留           |
| 恢复并切 1.5 倍速 | 媒体时间继续推进，累计提交 491／呈现 490，PQ 保留       |
| 返回 1 倍速       | 正常继续播放，随后人工观察窗口停在约 89.8 秒            |
| 异常              | 本轮诊断与页面错误均为空                                |

结果：test-results/real-video/default.json。页面截图只验证布局，不证明 HDR 亮度。

本轮没有测量实际声画延迟或完整色准，不把标签和时钟推进当作口型同步证据。submitted 和 presented 分别为送帧／呈现计数，不能直接当作统一丢帧率；presentationTime 与源文件 PTS 分开记录，不据此直接推算音画延迟。

仍需验证：WASM 软解、其他音轨、长时间稳定性、快速连续拖动、真实字幕弹幕、旋转、切源及资源预算。该实验只能支持是否继续迁移的判断，不能作为替换正式 Canvas 内核的完整验收。

## YouTube WebM 原文件验证

用户提供的 LG Jazz 下载文件经 ffprobe 确认为 1920×1080、约 60fps、AV1 Main 10-bit、BT.2020/PQ、Opus 立体声，时长 158.601 秒；文件名的 4K 不是实际分辨率。

仅给实验页的文件选择器增加 .webm，使用既有 ALL_FORMATS 解封装及 WebCodecs 解码，未转换媒体。连续约 10 秒累计呈现 721 帧；暂停 3 秒时媒体时间和送帧冻结；暂停中跳转至 60 秒、恢复播放均通过，各采样阶段保留 PQ 标签，没有诊断错误。最终累计提交与呈现均为 945 帧。

此结果不代表正式播放器已开放 WebM，也未完成长播放和屏幕色准验证。结果文件：test-results/real-video/youtube-webm.json。
