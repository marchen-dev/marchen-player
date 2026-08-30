## 动机

Marchen 当前随应用携带的 FFmpeg 版本停留在 4.x，并通过长期未维护的 installer 与 `fluent-ffmpeg` 调用。它可以完成截图和字幕提取，但无法作为后续媒体兼容层的可靠基础。Chromium 对本地视频的实际支持还同时受到容器、视频编码、音频编码和设备硬件解码能力影响；直接把所有 HEVC 视频默认转码会浪费算力、延长启动时间并损失画质。

现有 Electron 播放源使用包含真实文件路径的 `marchen://` URL。该 URL 同时承担内部媒体传输、持久化路径和外部协议名称，Windows 路径解析脆弱，也不适合承载 FFmpeg 分片、seek 和会话释放。影视库又依赖 HISTORY 中的稳定路径续播，因此引入临时 localhost URL 时必须先明确稳定媒体身份与临时播放租约的边界，避免把端口、token 或转码分片写入数据库。

本变更为 Electron 建立现代 FFmpeg 媒体兼容后端：原生播放与硬件解码优先，只在容器、EAC-3 或 HEVC 能力不足及实际解码失败时按需 remux 或转码，并保持影视库续播、进度、截图、字幕和自动下一集行为正确。Web 端继续只使用浏览器原生能力，不引入本地 FFmpeg 或上传视频。

## 变更内容

- 将 FFmpeg/FFprobe 升级为固定版本的完整二进制，仅面向 macOS x64/arm64 与 Windows x64，以 Electron 资源而非 npm 平台 installer 分发；记录对应源码、来源、版本、构建配置、能力清单和校验值。
- 移除 `fluent-ffmpeg` 和现有打包期间增删依赖、裁剪架构的脚本，改由 Main 进程使用参数数组直接执行 FFmpeg/FFprobe，并统一进度、取消、错误和退出清理。
- 用 ffprobe 客观输入事实与 Renderer 的浏览器解码能力选择固定输出档位：`native`、`copy-video-aac`、`safe-h264-aac-sdr` 或 `hdr-to-sdr-h264-aac`。HEVC 默认尝试原生硬解，EAC-3/FLAC 等音频不兼容时优先复制视频并仅转换音频；优化档位不能在期限内证明可播放时受控升级到安全档位。
- 新增只绑定 loopback 的本地媒体网关和有所有权的媒体会话。第一阶段仅让兼容流通过 fMP4 HLS 与 MSE 播放，正常直放暂留现有 `marchen://` Range；Gateway 经过直放、打包态和影视库回归后再接管原文件 HTTP Range，最终收敛为统一传输层。
- 将原始文件定位信息、逻辑媒体时间线和临时播放 URL 分离。HISTORY 与影视库只持久化 hash、原始路径、原始 duration/progress 等稳定数据，绝不持久化 localhost URL、session token、FFmpeg PID 或分片路径。
- 迁移已有 `marchen://` HISTORY 路径，使内部协议在过渡期只承担直放传输而不再承担持久化定位；先移除外部深链注册，待 Gateway 直放完成打包态验收且仍保留可回退路径后，再移除路径型内部协议。文件关联继续负责双击打开。
- 保持截图、内嵌字幕、播放列表和影视库以原始媒体身份工作；转码 seek 后仍将播放器时间映射回原视频时间，防止续播进度和已看状态错误。
- 为能力判断误报提供一次性运行时回退：原生播放发生 `decode` 或 `not-supported` 时可切换兼容会话，其他错误不得误触发转码或形成重试循环。
- 将 FFmpeg 产出可消费分片的 `producer-ready` 与 Chromium 实际完成 MSE 挂载、元数据加载和首帧解码的 `playable` 分离；只有后者可以作为播放成功、最近观看和验收依据。
- 明确默认视频/音频轨道、AAC 输出、10-bit SDR 与 HDR 的不同降级策略、闭合 GOP 和转码时间戳策略；限制 FFmpeg 输入协议、执行时间、输出规模和并发，处理异常退出残留与磁盘不足。
- 建立小型合成样本、30–60 秒结构样本和 Electron 首帧 E2E 三层验证，并将两个本地真实 MKV 作为不入库的验收门禁，覆盖长 GOP、缺失 codec string 与不完整色彩元数据。

## 能力

### 新增能力

- `ffmpeg-runtime`：固定版本 FFmpeg/FFprobe 在 macOS 与 Windows 的获取、打包、定位、能力校验、安全执行和资源治理。
- `media-compatibility-planning`：结合完整输入事实、目标 fMP4/MSE 能力和浏览器解码能力选择固定且可验证的输出档位。
- `adaptive-transcode-playback`：分阶段引入本地媒体网关和受控转码会话，提供渐进 HLS、优化档位升级、安全视频转码、seek、两阶段可播放验证、回退与释放，并在验收后统一传输层。
- `durable-media-sources`：稳定原始媒体身份、临时播放租约、逻辑时间线、HISTORY/影视库迁移及路径型 `marchen://` 下线规则。

### 修改能力

- 无。现有播放器、影视库和字幕能力的用户行为保持不变，由新增兼容能力提供 Electron 平台实现。

## 影响范围

- Electron Main：FFmpeg 模块、媒体探测、子进程生命周期、localhost Media Gateway、临时目录、应用退出清理和打包资源定位。
- Electron Renderer：Source lifecycle、HTMLVideoElement/MSE 适配、Media Capabilities 探测、播放失败回退和平台 capabilities。
- 共享播放层：播放源租约、稳定 source identity、逻辑 duration/currentTime 和异步 prepare 的竞态处理。
- player-loading：`VideoInfo` 中持久化来源与临时播放地址分离，取消加载时释放迟到的会话。
- IndexedDB：HISTORY 路径迁移，影视库通过 hash 与原始路径续播，进度和已看状态使用原始时间线。
- 截图、字幕与播放列表：始终使用原始媒体引用，不消费临时转码 URL。
- 构建发布：macOS x64/arm64、Windows x64 的对应 FFmpeg 资源；每个安装包只包含目标平台架构。本变更不提供或验收 Linux FFmpeg 兼容能力。
- Web：不包含 FFmpeg 二进制，不启动本地媒体服务，遇到不兼容编码时继续显示明确的浏览器能力错误。
