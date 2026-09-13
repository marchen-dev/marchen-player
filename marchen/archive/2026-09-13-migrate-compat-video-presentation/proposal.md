## 动机

兼容内核目前通过 Canvas 显示自行解码的视频，硬解 HDR 帧导入 WebGPU/WebGL 的既有实验出现精度损失。独立实验已用 WebCodecs → VideoFrame → MediaStream → video 播放真实 HEVC/AV1 HDR 文件，用户确认 HDR 显示正常；用户也确认 HEVC WASM → video 可播放。保留两套主画面呈现及切换回退会增加维护成本，用户明确要求不保留 Canvas。

实验还确认 video.pause 会导致本机 MediaStream 暂停帧转为 BGRA 并丢失 PQ 标签，而停止送帧、冻结自有媒体时钟可以保留 HDR 高光。需要把已验证方法接入正式播放生命周期，继续验证声画同步、资源释放与目标平台。

## 变更内容

- 兼容内核主画面统一改为 VideoFrame → MediaStream → video；删除 Canvas 主画面呈现和自动回退，不增加呈现方式开关。
- 保留原生内核，兼容内核继续复用 MediaBunny、WebCodecs、HEVC WASM、Web Audio、SoundTouch 和自有媒体时钟。
- 将停帧暂停、seek 代次隔离、轨道重建、首帧呈现确认和资源释放纳入正式适配器，不依赖实验按钮或构建替换。
- 内核语义改为 native/compat，解码后端与呈现状态分别表达；兼容历史 canvas 设置值，UI 使用“兼容内核”。
- 延续 Electron 与桌面 Chromium 的产品范围，增加轨道生成及实际首帧能力检查。兼容路径不可用时使用现有原生路径或明确错误，不回退 Canvas。
- 与 add-canvas-hdr-output 建立替代关系：其 Canvas HDR 实现任务被本变更替代，旧实验记录保留，不把旧任务标为成功。实现阶段明确标注 superseded 状态及交叉链接。

## 能力

### 新增能力

- `compat-video-presentation`：兼容内核统一 video 呈现、解码复用、HDR 与首帧证据。
- `compat-playback-lifecycle`：音频时钟主导的停帧、seek、倍速、换轨、结束与资源释放。
- `compat-support-migration`：支持范围、设置迁移、UI/遥测语义及旧主画面路径清理。

### 修改能力

当前仓库没有集中 marchen/specs 目录，本次以以上能力定义迁移契约，替代已归档双内核设计中“兼容内核必须 Canvas 呈现”的约定。

## 影响范围

涉及 services/media/canvas 的适配器与呈现、services/player-runtime 的内核策略/资源/能力判断、NativePlayer 显示表面、playback-core 类型、设置和诊断、字幕尺寸/旋转/全屏关联及部署说明。HEVC 和音频解码依赖不升级，不新增 Node FFmpeg/MSE 播放链，不修改弹弹play API、hash 或 HISTORY 数据模型。

不移除字幕、预览、缩略图等独立用途的 Canvas；不新增完整 WebM 产品支持（实验支持不等于导入、匹配和资料库支持）。不扩展移动端、Safari/Firefox 兼容内核、HDR10+/Dolby Vision、音频直通及多声道输出范围。不承诺性能提升百分比或尚未验收的跨平台 HDR。
