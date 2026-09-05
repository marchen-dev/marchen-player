## 动机

Marchen 已通过 `add-ffmpeg-compat-playback` 建立 FFmpeg runtime、媒体探测、受控子进程、播放租约、loopback Media Gateway 和 fMP4 HLS 兼容播放基础，并能处理 HEVC 与 EAC-3 的典型组合。但当前决策仍围绕四个固定 OutputProfile 展开，codec string 推导、浏览器能力表达、视频/音频复制策略和失败原因都只覆盖有限组合。遇到 AV1、VP9、VC-1、MPEG-2 或新的音频格式时，系统无法像 Jellyfin Web 一样通过统一能力模型决定直放、重封装或转码。

现有 HLS 生产方式也由 FFmpeg 维护 EVENT 清单并持续向影片末尾生成；seek 会释放整个 generation、创建新 URL 并重新挂载播放器。它已建立原子发布与逻辑时间校准基础，但 seek 失败恢复和连续操作仍需补齐，并导致长视频产生大量 `.m4s` 缓存，音频兼容场景也可能因预检、首段验证或长 GOP 等待出现明显启动延迟，随机 seek 的恢复速度与 Jellyfin 的动态 HLS 仍有差距。

本变更参考 Jellyfin Web 的 DeviceProfile、Server StreamBuilder、Dynamic HLS 与 TranscodeManager 分层，将“针对 HEVC/EAC-3 的兼容功能”升级为“浏览器不支持但 FFmpeg 能处理的本地媒体自动兼容播放”。对齐的是本地桌面 Web 播放模型，不复制 Jellyfin 的多用户服务器、远程媒体、Live TV 和多码率分发能力。

## 变更内容

- 建立 Electron Chromium 的客户端播放能力 Profile，统一描述 direct、fMP4 HLS、视频/音频 codec、Profile、Level、位深、动态范围、声道和字幕交付能力；能力来源保留 `MediaCapabilities`、`canPlayType` 与运行时实际失败证据。
- 将 ffprobe 输入事实、客户端 Profile 与 FFmpeg runtime decoder/encoder/filter/format 能力交给统一兼容匹配器，输出结构化原因以及 Direct Play、Direct Stream 或 Transcode 决策；`smooth` 与 `powerEfficient` 不作为转码门槛，unknown 先尝试直放并允许一次受控回退。
- 将固定组合型 OutputProfile 重构为容器、视频、音频三个正交动作。视频可复制时不得因容器或音频问题重编码；任意浏览器明确不支持、但 FFmpeg 有 decoder 的输入视频均可转为 H.264，音频按目标能力选择 copy 或 AAC。
- 扩展 RFC 6381 codec string 与兼容条件处理；静态事实不足时允许通过短 remux/init 探测补充，但不得把缺失事实静默解释为支持。
- 把兼容播放改为稳定会话 URL 与服务端 VOD 时间线。视频复制优先按真实关键帧生成分片边界，视频重编码使用受控 GOP；segment 缺失、反向 seek 或远距离 seek 时由请求驱动 FFmpeg 从目标附近恢复，而不是由 Renderer 整体替换业务会话。
- 引入明确的 FFmpeg Playback Job 生命周期、活跃请求计数、心跳/空闲停止、ahead buffer、可选节流与安全分片回收；保留 Marchen 现有临时文件原子 rename、Producer Validator、Gateway token 和逻辑时间线校准。
- 为软件/硬件视频解码、硬件/软件 H.264 编码和 AAC 编码器建立可观测选择与失败回退；提供仅开发态生效的强制全转码、强制软件解码和强制软件编码入口。
- 增加结构化兼容原因、attempt chain、首帧/seek/生产位置/消费位置/缓存指标及播放信息展示，并以真实本地样本验证 HEVC、AV1、VP9、VC-1、MPEG-2、EAC-3、FLAC、HDR、长 GOP、VFR 和非零时间线。

## 能力

### 新增能力

- `client-playback-profile`：表达当前 Electron Chromium 对 direct 与 fMP4 HLS 的容器、视频、音频和字幕能力。
- `media-compatibility-negotiation`：以输入事实、客户端 Profile 和 FFmpeg runtime 能力统一选择 Direct Play、Direct Stream 或 Transcode，并给出结构化原因。
- `ffmpeg-pipeline-planning`：将容器、视频、音频的独立动作编译为可验证 FFmpeg pipeline，支持通用输入 decoder、硬件/软件选择及固定兼容输出。
- `dynamic-hls-playback`：提供稳定 VOD 清单、关键帧时间线、按需 segment 生产与不更换逻辑会话的随机 seek。
- `transcode-job-lifecycle`：管理 FFmpeg Playback Job 的并发、活跃请求、心跳、ahead buffer、节流、停止和缓存回收。
- `compatibility-fallback-observability`：提供有限运行时回退、分阶段错误、attempt chain、转码原因、性能指标和开发态强制路径。

### 修改能力

- `media-compatibility-planning`：从四个固定组合档位升级为客户端 Profile 驱动的通用兼容协商。
- `adaptive-transcode-playback`：从 FFmpeg EVENT generation 切换升级为稳定会话下的动态 VOD HLS 与请求驱动作业。
- `ffmpeg-runtime`：从校验固定必要能力扩展为向 planner 提供完整可用 decoder、encoder、filter、format 与硬件能力目录。

## 影响范围

- `packages/shared/src/media/`：客户端 Profile、输入事实、兼容原因、播放决策、pipeline 和 Job/segment 状态类型。
- `src/renderer/src/services/player-runtime/`：能力 Profile 构建、播放决策请求、HLS 稳定会话、实际失败回退和开发态覆盖。
- `src/main/modules/ffmpeg/`：runtime 能力目录、codec 映射、probe/keyframe 缓存、decoder/encoder 选择、AAC 策略和 pipeline compiler。
- `src/main/modules/media-gateway/`：VOD manifest、动态 segment 路由、稳定 session、Job 生命周期、seek、缓存窗口和清理。
- `src/main/ipc/`、`src/preload/`：播放协商、会话、segment/seek 状态和诊断 IPC 契约。
- 播放信息与设置 UI：播放方式、copy/transcode 轨道、decoder/encoder、原因和开发态强制选项。
- 测试与本地样本 smoke：单元、集成、Electron 首帧/seek E2E，以及 macOS/Windows 打包态回归。

本变更依赖 `add-ffmpeg-compat-playback` 已建立的 runtime、DurableMediaSource、SourceLifecyclePort、Gateway 安全边界、HLS/MSE 适配和媒体会话所有权，不重新实现这些基础设施。Web 构建继续只使用浏览器原生能力，不获得本地 FFmpeg；Linux、远程输入、多用户、Live TV、多码率 ABR、输出 HEVC/AV1 和跨启动永久转码缓存不在范围内。

## 实施优先级与证据边界

保留通用协商与稳定 Dynamic HLS 的目标，按“旧 seek 恢复 → 正式 compiler/分片时间线校准 → Job 所有权与取消 → HEVC copy + AAC 应用入口接入 → 视频转码与资源控制 → 性能、平台验收和默认切换”的依赖顺序推进。首条 v2 路径通过前不同时启用硬件优化与旧分片删除；最终默认路径仍须具备有限 ahead 和缓存预算。

稳定分片身份必须对应可验证的媒体时间范围，Job 替换必须处理未完成请求，能力证据必须区分 file 与 MSE。实验应复用正式 compiler、publisher 和 router，避免独立脚本修正参数而应用仍运行另一套实现。

已有模块测试、独立浏览器 spike、真实应用入口验证和打包态验证分别记录；旧路径或独立实验通过不代表新应用路径通过。历史实验保留原貌，修订后的要求由新增任务和重新验收覆盖，不把未接入功能记为已交付。

### HLS 边界实验后的实施选择

继续使用 FFmpeg HLS muxer（`-f hls`），暂不引入 segment muxer，也不因单个实验直接降级 HLS.js。清单使用累计目标切点；Job 重启产生的边界变化必须按管线、客户端版本和实际时间覆盖验证，不再要求所有同编号分片在不同 Job 中范围完全一致。已发布资源仍不可覆盖，画面错位、目标不可达或音画不连续不能放行。

优先验证尾段起点、seek 偏移与分片编号的对应关系，不照搬 Jellyfin 的 `duration - 5` 钳制或把 `+0.5 秒` 视为通用修复。独立合成实验只提供方向，正式 compiler/publisher/router 与真实媒体验收仍待完成。
