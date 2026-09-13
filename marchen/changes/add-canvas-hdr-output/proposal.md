> 本实现计划已由 [migrate-compat-video-presentation](../migrate-compat-video-presentation/proposal.md) 替代，勿继续执行 Canvas 主画面 HDR 接入。原任务和实验完成事实保留，不代表旧方案交付成功。

## 动机

现有 Canvas 内核能解码 HEVC 10bit 并保留色彩信息，但输出仍为 SDR，支持 HDR 的 MacBook 屏幕无法呈现原有高光范围。本变更增加限定解码路径的 HDR 输出，同时保证 SDR 视频沿用现有路径，不承担新增渲染资源和持续开销。

## 变更内容

- 在现有 Canvas 内核内增加按需加载的 HDR 输出，本次限定原本已经由 libav 软件解码的 HEVC HDR10/PQ、HLG 视频，通过原始 I420P10 平面呈现。
- Canvas 的 WebCodecs 路径保持现有 HDR→SDR，不因屏幕支持 HDR 自动改为软解；本次不交付硬解 HDR。
- 保留 H5/Canvas 双内核，不新增 MSE 重封装或原生视频桥接链路，不修改 Chromium、不依赖实验开关。
- 软解高精度平面到 HDR 输出必须先通过灰阶、色彩及实机验证；不能把原有失败的 VideoFrame 导入路径用于软解后再次损失精度。
- SDR（包含 10bit SDR）继续现有渲染，不创建 HDR WebGPU 设备或高精度资源；H5 仍由浏览器原生呈现。
- 显示实际输出状态和回退原因；处理显示器变化、全屏、GPU 丢失、视频切换与资源释放，保持播放意图和时钟。
- 缩略图、历史封面继续 SDR；弹幕和字幕保留独立覆盖层。
- 仅做与本变更相关的代表样片、生命周期和性能对比；平台结论必须有实机证据。

不包含 Dolby Vision/HDR10+ 动态元数据、HDR 截图导出、新内核、Node 转码、Safari/Firefox Canvas 解禁及移动端适配。Windows HDR 可用性按实际验证记录，不作为首阶段 Mac 交付的前置条件。

## 能力

### 新增能力

- `canvas-hdr-output`：软解 HDR 高精度输出、色彩处理、能力检测、回退和实际状态展示。
- `hdr-rendering-isolation`：SDR 路径隔离、资源生命周期和性能回归边界。

### 修改能力

无独立修改能力；以上增量规范约束现有播放器集成点，不重新打开旧内核迁移变更。

## 影响范围

主要涉及 renderer 的 services/media/canvas、services/media/render、播放呈现状态、设置展示及遥测映射；按需补充构建类型和部署说明。复用 MediaBunny、WebCodecs、现有 libav 包、音频时钟和 Worker 调度，预计无需数据库迁移或 libav 发布。若实验证明必须调整这些边界，先更新规划。

规划只写本变更目录，保留工作区已有 player.css 修改。原包含硬解 HDR 的 2–4 / 5–8 人日估算不再作为本范围交付承诺；剩余成本由软解平面直传小样验证收敛。2026-09-08 用户授权按建议调整后续方向，本次仍围绕 Canvas HDR 增量，收敛为部分解码路径支持，不将延期能力标为已完成。
