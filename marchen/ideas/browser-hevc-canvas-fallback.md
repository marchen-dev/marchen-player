---
format: 1
title: 浏览器 HEVC 软解与 Canvas 备用播放内核
summary: >-
  探索以原生 video 优先、Canvas 兼容回退替代播放转码，先验证浏览器 HEVC WASM 的性能、10-bit 色彩与 MediaBunny 或
  libmedia 的接入成本。
tags:
  - player
  - hevc
  - wasm
  - canvas
  - mediabunny
  - libmedia
  - electron
createdAt: '2026-09-05T11:51:13.573Z'
updatedAt: '2026-09-05T11:51:13.573Z'
---

> 本文记录尚未定案的探索背景；晋升后以正式变更产物为准。

## 背景与价值

Marchen 的本地兼容播放正在实现 FFmpeg 与 Dynamic HLS，但分片时间线、Job 重启、连续 seek、MSE 恢复和缓存管理带来较多复杂性。用户提出探索只保留原生 HTMLVideoElement 与 Canvas 两个播放内核，在原生无法播放时切换 Canvas，并询问无 HEVC 硬解机器的兼容方式。

本 Idea 按用户明确的 Capture 请求，暂存尚未选定的替代技术路线。它不修改、取消或归档现有 open change，也不授权删除转码实现；若最终采用并改变现有变更范围，须同步修订其规划，避免并行维护矛盾方案。

## 已确认

- 当前讨论基于 feat/player-refactor、HEAD 6c5f1fc 及大量未提交兼容播放代码。新 generalized 与 Dynamic HLS 已在开发开关下接通部分入口，仍有验收未完成；旧对话中“完全未接入”的结论不能直接作为当前状态。
- MediaPort 已抽象播放命令、状态事件与快照；DOM 弹幕读取 PlaybackClock，历史、连播和控制层有复用基础。宿主、首帧检测、媒体准备与回退仍依赖 HTMLVideoElement/HLS，需要适配。
- 现有 libass-wasm 支持独立 Canvas 与手动时间驱动，字幕不必整体重写。截图、探测、字幕提取与转换仍使用 FFmpeg；去掉播放转码不等于删除 FFmpeg。
- 核对的 MediaBunny 克隆提交为 c67c5e4。浏览器核心库默认使用 WebCodecs；不自带 HEVC WASM 解码器。prefer-software 不能补出浏览器不存在的解码器。
- MediaBunny 的 CustomVideoDecoder 与 registerDecoder 可接入第三方或自行编译的 HEVC WASM decoder。该版本优先选择匹配的自定义 decoder，硬解优先、软解回退需明确控制，不能注册后无条件抢占 HEVC。
- 只在浏览器环境中用 WASM CPU 软解 HEVC 技术上可行，已有 libmedia 等实现。libmedia 提供 AVPlayer、独立 WASM 编解码模块及音频和画面渲染能力；多线程涉及 SharedArrayBuffer 与跨源隔离。功能声明不等于目标机器或样片已验证。
- @mediabunny/server 经 node-av 调用原生 FFmpeg，已具备 HEVC 软解能力；WASM 并非软解的唯一形式。原生 AVFrame 可被 VideoSample 引用包装，不必立即复制像素。独立解码进程是隔离选择，不是该扩展的硬性要求。
- 原生解码到页面显示仍缺应用桥接。MediaBunny toVideoFrame() 对原生资源会组装并复制平面；copyTo(RGBA) 会触发软件转换与额外缓冲。核对的 NodeAV v6.0.0 frame.data 使用 NewOrCopy，在不允许 external buffer 的 Electron 环境下可能复制，具体进程需验证。
- server 文档及 NodeAV #156 的共享纹理示例是 Electron 画面采集到原生编码链，不证明 HEVC CPU 软解到 Renderer 显示已零拷贝。
- HDR 解码、HDR 正确映射成 SDR、完整 HDR 输出是不同能力；普通 Canvas 示例不能作为色彩正确性证据。

## 当前倾向

- 最终候选架构为原生 video 优先、Canvas 兼容内核回退，避免为本地文件重新编码并生产 HLS。但是否删除现有转码路线尚未定案。
- 最近讨论聚焦纯浏览器方案：先用 libmedia 的现成 AVPlayer 测试 HEVC Main 10/HDR/E-AC-3 样片，确认性能后再决定直接接入 AVPlayer，还是将 HEVC WASM decoder 适配给 MediaBunny。
- WASM 路线可以省掉原生插件及应用层 Node→Renderer 原始帧 IPC，但仍有解码内存、帧传输和 GPU 上传成本；不能据此认定比原生 FFmpeg 更快或更省内存。原生 server 方案仍是候选。
- Canvas 侧优先保持 YUV 到 GPU 渲染，探索 Worker 内 OffscreenCanvas，避免 CPU RGBA 转换和 GPU 读回；使用有界队列、缓冲池与明确释放规则。
- 已知所选音视频轨不兼容时可直接选 Canvas；能力未知时尝试原生，明确解码错误后只回退一次。文件错误、用户取消、自动播放受阻和单纯慢不应无条件切内核。有画面不能证明所选音轨也正常。

## 待确认

- 选哪个 HEVC WASM decoder：目标 Main 10、B 帧重排、extradata/压缩包格式、flush/seek、错误恢复、维护状况与发布条件是否满足需求？是否已有可直接适配的接口？
- 在无 HEVC 硬解的目标机器上，1080p 24/30fps 与 4K 的 CPU、掉帧、音画偏差、峰值内存分别如何？不能用有硬解机器的默认播放证明软解性能。
- 多线程 WASM、SIMD、SharedArrayBuffer、Worker/OffscreenCanvas 在 Electron 与 Web 桌面构建中如何配置和降级？
- libmedia 独立作为 MediaPort 后端，与 MediaBunny 加自定义 decoder，哪条维护面更小？避免两套库重复承担解封装和播放调度。
- 如何保证 HDR10/HLG 至少正确映射成 SDR？完整 HDR 输出是否首期必需？Dolby Vision 与音频直通没有纳入已确认范围。
- 连续前后 seek、片尾回跳、暂停恢复、倍速不变调、切音轨、切集、字幕与弹幕同步、资源释放是否可靠？
- 若采用原生 server，帧应在哪个进程持有、如何显示、有哪些实际复制？共享内存和共享纹理是否值得其平台适配成本？
- Canvas 达到什么验收条件后才删除播放转码/HLS？哪些 Range 读取、租约、探测、截图与字幕模块需要解耦保留？
- 前面原生 Canvas 交付曾粗估 30–50 人日、删除转码另加 3–7 人日，均非实测工期，也不适用于直接推算 WASM 路线；选型实验后重新估算。

## 已否决

- 把“安装 MediaBunny 核心库”当成自动获得浏览器 HEVC 软解。
- 将共享纹理采集/编码示例当成软解后零拷贝播放的现成证据。
- 为了移除播放转码而连同截图、字幕提取等 FFmpeg 能力一并删除。
- 将 IPTVnator 实验性内嵌 mpv 当成成熟落地依据：用户试用反馈问题较多；这不等于否定 libmpv 本身。
- 不因减少 IPC 就认定 WASM 胜过原生解码；两条路线均需实际性能证据。

## 相关上下文

- packages/playback-core/src/types.ts：MediaPort 契约。
- src/renderer/src/services/player-runtime/：runtime、回退、平台、字幕、弹幕与历史组合。
- src/renderer/src/components/modules/player/NativePlayer.tsx：当前 video 宿主。
- src/main/modules/ffmpeg/、src/main/modules/media-gateway/：共享媒体工具及待替换的播放生产链。
- marchen/changes/generalize-media-compat-playback/、marchen/changes/add-ffmpeg-compat-playback/：相关 open change，采用新方向前须调和规划。
- marchen/archive/2026-08-30-replace-xgplayer-runtime/：当前运行时分层背景。
- 外部源码：用户提供的 mediabunny 克隆，提交 c67c5e4，重点 packages/server/src/video-decoder.ts、video-sample.ts、src/sample.ts、src/custom-coder.ts、src/media-sink.ts。
- https://mediabunny.dev/guide/extensions/server
- https://mediabunny.dev/api/CustomVideoDecoder
- https://github.com/zhaohappy/libmedia
- https://github.com/Vanilagy/mediabunny/issues/200 ：2025 年旧 Node 限制不能套用当前 server 扩展；大文件应按需读取。
- https://github.com/Vanilagy/mediabunny/discussions/191 ：Electron 多格式播放器讨论，未提供 HEVC WASM 播放性能证明。
- https://github.com/seydx/node-av/issues/156 ：共享纹理导入、释放与采集背压。
- https://github.com/seydx/node-av/issues/159 ：颜色元数据遗漏导致 VideoToolbox 编码失败的历史修复。

## 下次从这里继续

先验证 libmedia AVPlayer 在明确强制 HEVC 软件解码下播放 Main 10/HDR/E-AC-3 本地样片的性能、色彩和连续 seek，结合其源码决定直接作为 Canvas 后端还是适配 MediaBunny；实验通过前不删除现有转码链。
