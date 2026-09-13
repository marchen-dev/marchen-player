> 本实现计划已由 [migrate-compat-video-presentation](../migrate-compat-video-presentation/proposal.md) 替代，勿继续执行 Canvas 主画面 HDR 接入。原任务和实验完成事实保留，不代表旧方案交付成功。

## 背景

基线为 feat/player-engine 已提交双内核实现。CanvasFrameRenderer 初始化普通 2D context；可读 HDR 帧执行 YUV copyTo → WebGL HDR→SDR → 中间画布 → 最终画布，不透明 GPU 帧直接 drawImage。hevc-decoder 保留 I420P10 和 colorSpace。既有 HDR shader 为 SDR 目标设计，不能直接标记为 HDR 输出。旧变更已归档，本变更独立推进。

初步验证见 [hdr-import-spike.md](evidence/hdr-import-spike.md)：H27P3 在移除自动化强制 sRGB 参数后能被 Chrome 检测为 HDR，FP16/extended 配置成功；已知 1000 nit 合成 PQ 灰阶导入后读回约 0.87988。该现象尚不能独立确诊浏览器 tone mapping，也不能把任意纹理值直接换算为屏幕 nit；须排除测试构造、色彩转换、参考白及编码解释错误。真实 4K PQ 不透明 VideoFrame 可导入，不代表已证明硬解或高光正确。

## 目标与非目标

**目标：** 在 Mac HDR 显示环境（包括当前 H27P3）上为原本已走 libav HEVC 软解的视频提供 PQ/HLG 高精度 HDR 输出；覆盖 Electron 打包态及桌面 Chromium 正式 Web。保持 SDR 隔离、WebCodecs 优先与可靠回退。

**非目标：** 本次不交付 Canvas WebCodecs 硬解 HDR，不继续扩展 WebGL 桥接、浏览器补丁或实验开关，不引入 MSE 重封装、原生呈现第三路径、Node 播放链、解码包发布、数据库迁移、HDR 截图及移动端。Safari/Firefox Canvas 禁用规则不变。Dolby Vision/HDR10+ 动态元数据和 Windows HDR 全矩阵不在本次范围。

此次范围由用户在 2026-09-08 授权收敛。前期失败试验仍是历史证据，不改写为成功；软解 HDR 通过不代表硬解 HDR 已交付。

## 决策

### 1. 输出选择与懒加载

在既有策略选定解码后端后，根据轨道/首帧色彩信息选择呈现路径，以 PQ/HLG 及必要元数据识别 HDR，不以 10bit 或 HEVC 编码名判断。SDR 分支静态复用现有实现，不 import HDR 模块、不请求 WebGPU adapter/device。能力探测按播放会话缓存，仅在 HDR 进入及相关显示条件变化时更新，禁止每帧全面探测。

HDR 模块独立动态加载，不在启动预热；禁止打包配置将其强行合并进 SDR 入口。H5 不切换渲染实现，不伪造 HDR 输出状态。只有 libav 软解后端、有效 PQ/HLG、完整色彩数据和可用 HDR 输出能力同时满足时自动启用新增 HDR；WebCodecs 播放 HDR 源时保持现有 HDR→SDR 路径，播放 SDR 源时保持现有 SDR 路径。无需新增用户开关和持久化字段，不能为了 HDR 改变解码器优先级。

### 2. 可替换呈现层

在第一次 getContext 前选定渲染后端；同一个 canvas 已获得 2D context 后不能再取 WebGPU。由呈现宿主管理独立或重建的画布，保持 DOM 交互、尺寸、旋转、层级和字幕弹幕容器稳定。HDR→SDR 回退只替换呈现资源，不重开媒体会话和音频。

复用现有播放时钟、Worker、VideoFrame 传输和 seek 代次。异步初始化、上传及 draw 前检查会话代次，过期帧立即关闭；设备和缓冲存活期间复用，不在每次 play/seek 时重建。

### 3. WebGPU 高精度输出

采用 rgba16float 呈现目标及 toneMapping extended。依据浏览器规范明确工作色域、纹理及画布各阶段实际采用的编码、参考 SDR 白与绝对亮度比例；高精度纹理不等于自动获得正确 HDR。

本次直接使用 libav 原始 I420P10 平面，不调用 importExternalTexture/texImage2D(VideoFrame) 作为新增 HDR 的输入。Worker 协议可增加有限容量的高精度帧变体，传递 layout、位深、色彩和时间信息及有所有权的 ArrayBuffer；禁止直接转移仍被 WASM 持有的线性内存。解码器内存中的数据必须复制到受控的输出缓冲再传递，明确每次复制与释放；保留既有背压/seek 代次，避免第二套时钟或无界帧队列。

先检查现有 VideoSample 到 VideoFrame 转换是否保持 CPU 平面；小样必须从 libav 实际输出进入新 HDR renderer，不能只用构造帧代替。如果既有转换不能保证原始精度，在进入 VideoFrame 前分流平面数据。软解 SDR/HDR→SDR 仍保持原路径，本次分流仅用于符合条件的 HDR 输出。

硬解导入排查到此收尾，详见 evidence/hdr-import-spike.md 的三轮记录。当前测试未找到保留高精度的默认 WebGPU/WebGL 导入，copyTo 也被不透明帧拒绝。后续若上游接口或实现发生实质变化，再独立恢复硬解 HDR 研究，不作为本次任务依赖，也不建立自动监控。

禁止对未知转换结果乘常数冒充 HDR 恢复。根据已知 PQ/HLG、参考白进行数学变换属于正常渲染步骤。

软解 I420P10 保留原有 WASM 解码，用可复用平面缓冲和 GPU 纹理上传；复用色彩数学但重新实现 HDR 目标 shader。处理 layout/stride、range、matrix、primaries、visibleRect 和旋转。PQ 使用绝对亮度映射，HLG 明确参考显示/系统 gamma 假设；不得沿用当前固定 SDR Hable 映射。静态峰值元数据可获得时使用，缺失时记录有依据的回退假设，不声称使用不存在的 MaxCLL 或母版信息。不得 CPU 生成逐帧 RGBA 再上传。

依据：[Chrome WebGPU HDR 输出](https://developer.chrome.com/blog/new-in-webgpu-129?hl=en)。本地 MediaBunny media-player 示例是 2D Canvas 播放参考，不是完整 HDR 渲染实现。

### 4. 能力、恢复与状态

区分 canvasSupported、hdrSource、HDR 呈现能力、当前实际输出与 fallbackReason。dynamic-range 媒体查询仅是显示条件信号，须结合 device/context 创建、首帧呈现和已验证平台路径；不能仅凭查询为 high 就报告 HDR。

监听可用的显示条件、窗口/全屏变化及 device.lost。浏览器无法精确报告跨屏变化时记录限制，能力不明时保持正确 SDR，不读取不存在的系统亮度 API。后台/全屏变化不得自动暂停。恢复采用有界重试，失效后退 SDR，防止 GPU 创建循环；无正确呈现路径则统一播放错误。

状态沿现有 MediaPresentation、设置与遥测管道传播：SDR、HDR、HDR→SDR、浏览器原生管理；初始化期间不提前报告 HDR。遥测仅包含输出模式、阶段、后端和枚举原因，不包含文件路径、标题或帧内容。不要把 WebCodecs 一概标为硬件解码。WebCodecs 路径的回退原因使用“当前解码路径暂不支持 HDR 输出”，区别于设备不支持；软解能力不足则显示实际设备/格式/渲染错误原因。

### 5. 覆盖层与资源预算

字幕/libass、DOM 弹幕独立合成，保持普通 SDR 参考白的可读性，不把覆盖层一起做视频 tone mapping。预览/历史封面保持现有 SDR 管线，不启用 HDR 呈现或恢复截图功能。

输出只保留必要的在途帧和纹理，容量有界，复用 staging/上传资源；关闭及 HDR→SDR 时取消待完成操作、关闭帧、释放 GPU 资源并移除监听。JS 模块缓存可保留。高精度资源不计入 libav WASM 线性内存上限，不提高其 768 MiB 限制。

### 6. 分阶段、有限验证

先进行 libav 原始 PQ 平面到 HDR 画布的可撤回小样和实机验证，检查正确颜色和真实高光再扩展；API 标志、常规 SDR 截图和合成帧测试不足以独立证明 HDR 输出。用已知亮度阶梯/灰阶测试图及代表视频，与可信原生 HDR 播放参考同屏或同条件对照；记录屏幕、系统亮度/HDR设置、环境和肉眼观察限制。没有测光设备时不声称测得绝对 nit 或专业色准。

随后验证 PQ/HLG 软解 HDR 代表片段，并回归 WebCodecs HDR→SDR、H5；测试工具可固定软解后端作颜色/性能对照，但必须另证实产品自动选择不会因 HDR 强制软解。继续验证 SDR 显示回退、SDR 8/10bit、全屏/跨屏/设备丢失、播放中 seek、暂停恢复、退出切源，以及字幕弹幕和预览。真实跨屏无设备时明确待验证，模拟事件只能证明逻辑。

性能同设备同片段同后端：每条约 60 秒，采集掉帧、CPU、可取得 GPU 数据、进程内存和几次首帧/seek。SDR 请求/资源证据必须确认零 HDR 初始化；若 SDR 稳定指标相对退化超过 5% 或出现新连续掉帧，仅针对该项复测排除噪声并修复，不扩大所有矩阵。5% 为排查触发线，不是每次采样的硬保证。HDR 内存记录实测峰值/稳态，重复切换三轮检查应用持有资源回落；驱动保留缓存不等于泄漏。基线 seek P95 约 2.17 秒已被用户接受，不重新强制 2 秒目标。

## 风险与权衡

- 硬解 HDR 已延期；本次成功条件为限定范围内的软解 HDR 和回归通过。若软解原始平面输出也不能保证色彩或实时性，暂停相关接入并报告，不能把该路径的失败掩盖为已完成。
- FP16 输出约 8 字节/像素，单张 1080p 约 15.8 MiB、4K 约 63.3 MiB；多缓冲和合成会放大成本，但去掉中间画布可抵消部分。具体成本以实测为准。
- 初次 GPU 初始化可能影响 HDR 首帧；懒加载保护 SDR 首屏，异步初始化和会话复用降低重复开销。
- HDR10/HLG 缺失色彩信息时无法靠位深推断正确颜色；不要盲目转换。
- 自动跨屏识别及亮度证明受浏览器和设备条件限制，验收必须保留证据边界，不能把单机结果推广到所有平台。
