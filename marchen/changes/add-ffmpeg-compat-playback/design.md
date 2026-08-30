## 背景

Marchen 已完成原生 `HTMLVideoElement`、`@marchen/playback-core`、平台 Ports、DOM 弹幕和 libass 字幕运行时重构。Electron 当前通过路径型 `marchen://` 自定义协议读取 MP4/MKV Range，通过 `@ffmpeg-installer`、`@ffprobe-installer` 和 `fluent-ffmpeg` 完成截图与字幕操作。该 FFmpeg 版本老旧，打包钩子还会在不同 macOS 架构之间动态增删依赖。

现有数据模型把多个不同概念都称为 `url` 或 `sourceUrl`：原始文件路径、可持久化 HISTORY.path、自定义协议 URL、Blob URL 和播放器实际 URL。`VideoInfo.acquireSource`、`SourceLifecyclePort` 与 `PlayerRuntime.sourceRelease` 也形成了重叠的资源所有权；正常 Electron 播放目前直接消费 `VideoInfo.acquireSource`，没有经过 `SourceLifecyclePort.prepare`。引入异步 FFmpeg 会话后，如果不先收敛这些边界，快速换片、React Strict Effects、路由退出和运行时回退都会产生迟到会话、双重释放或进程泄漏。

影视库以 fileHash 关联 episode，再从 HISTORY 读取原始路径、progress、duration、thumbnail 和字幕偏好。任何 localhost URL、转码分片时间线或失效 session token 被写入 HISTORY，都会破坏应用重启后的续播、进度百分比、已看判断、自动下一集、截图和内嵌字幕。

## 目标与非目标

**目标：**

- 在 macOS x64/arm64 和 Windows x64 中随 Electron 分发固定版本、完整能力的 FFmpeg/FFprobe，并统一现有截图、字幕和新增兼容播放的执行基础。
- 原生播放和 HEVC 硬解优先；在完整输入事实基础上选择 `native`、`copy-video-aac`、`safe-h264-aac-sdr` 或 `hdr-to-sdr-h264-aac` 固定输出档位，避免未经验证的流复制组合。
- 分阶段引入只绑定 loopback 的 Media Gateway：先服务 fMP4 兼容流，再在保留回退的前提下验证原文件 Range，最后统一传输层并移除路径型 `marchen://` 内部媒体传输。
- 为媒体会话建立单一 owner、可取消的异步 prepare、一次性原生失败回退、随机 seek、退出清理和可观察状态。
- 保持原视频逻辑 duration/currentTime，使 HISTORY、影视库、弹幕和字幕不受转码分片局部时间线影响。
- 迁移已有 `marchen://` HISTORY 路径；稳定原始来源与临时播放租约在类型和持久化层面不可混用。
- Web 保持纯浏览器播放，不包含 FFmpeg、Media Gateway 或本地视频上传。

**非目标：**

- 不发布公共 FFmpeg npm 包，也不在首版创建独立 `@marchen/ffmpeg` workspace 包。
- 不自行实现解复用器、HEVC 解码器、完整 MSE/HLS 播放栈或音画同步内核。
- 不把 FFmpeg WASM 作为 Web 兼容后端，不增加服务端上传转码。
- 不在首版建立跨启动持久化转码缓存；退出后允许删除所有会话分片。
- 不保证所有设备上的 4K60、HDR、Dolby Vision、10/12 bit 或多音轨切换；这些能力以验收样本和运行时探测为准。
- 不新增可由外部应用调用的 `marchen://` 深链产品能力。
- 不在本变更重做影视库 UI、播放器设置 UI 或弹幕/字幕渲染实现。
- 不为 Linux 构建、打包或验收 FFmpeg 兼容能力；正式移除现有 Linux 发布配置属于独立清理事项。

## 决策

### 1. FFmpeg 是 Electron Main 模块与构建资源，不是 npm 产品包

新增 `src/main/modules/ffmpeg/`，承载二进制定位、进程执行、probe、截图、字幕和转码 session。下载清单与获取脚本放在 `scripts/ffmpeg/`，构建缓存/资源按 `${platform}-${arch}` 组织。首版不抽 workspace 包，因为这些代码依赖 Electron app lifecycle、Node 子进程、文件系统和平台二进制，没有 Renderer/Web 复用价值。

二进制版本固定为实施时清单确认的稳定版本，初始目标为 FFmpeg 9.0.1 完整构建。清单记录每个 macOS/Windows 目标的对应源码、下载地址、SHA-256、FFmpeg 版本、`-buildconf` 与关键能力。下载使用固定资产地址，不使用浮动 `latest`。允许各平台供应方不同，但必须以运行时自检验证项目实际依赖的 decoder、encoder、muxer、filter 和 protocol，不能只依赖供应方的 “full” 命名。

electron-builder 使用目标宏只复制当前架构资源：

```yaml
extraResources:
  - from: resources/ffmpeg/${platform}-${arch}
    to: ffmpeg
```

打包运行从 `process.resourcesPath/ffmpeg` 定位，开发运行从仓库目标架构目录定位。删除 installer、`fluent-ffmpeg`、打包期间 `pnpm add/remove` 和事后裁剪其他架构的逻辑。macOS 签名/公证时确保资源内可执行文件进入签名验证范围。

### 2. 直接使用子进程参数数组并统一任务语义

所有 FFmpeg/FFprobe 操作通过一个 Main 进程执行器调用 `spawn(binary, args)`，不经过 shell，也不依赖 fluent builder 私有字段。执行器提供：

- AbortSignal/显式取消；
- 有界 stderr 环形缓冲与结构化退出错误；
- 独立 progress fd，避免与媒体 stdout 混合；
- 幂等释放与优雅退出超时后的强制终止；
- app quit、window closed、renderer gone 的最终清理；
- Windows 隐藏子进程窗口与各平台可执行权限验证。
- 强制关闭 stdin，限制允许的本地输入协议、探测/执行超时和诊断输出规模；
- 统一任务调度，前台播放优先于截图、缩略图和字幕转换，限制重型任务并发。

截图、ffprobe 和字幕提取先迁到新执行器，用现有调用方验证二进制引入，再复用同一基础实现转码。FFmpeg runtime 自检失败只关闭 FFmpeg 相关 capability，原生可播放媒体仍走 direct。

### 3. 在类型层分离稳定来源、逻辑身份与临时租约

不再让同一个 `url` 同时表示持久化路径和播放器 URL。目标模型为：

```ts
type DurableMediaSource =
  | { kind: 'electron-file'; hash: string; path: string; name: string; size: number }
  | { kind: 'web-file'; hash: string; file: File; name: string; size: number }

interface PlaybackSourceLease {
  id: string
  logicalSourceId: string
  url: string
  profile: 'native' | 'copy-video-aac' | 'safe-h264-aac-sdr' | 'hdr-to-sdr-h264-aac'
  originalDuration: number
  timelineOffset: number
  release: () => void
}
```

Electron 的持久化 locator 是规范化原始路径；Web 的 `File` 只活在当前页面会话且不进入影视库路径。fileHash 是内容身份，路径是重新打开文件的 locator，playback lease 是一次 Runtime 所有权下的临时资源。

`SourceLifecyclePort.prepare` 成为两端唯一的异步播放源入口。它在迁移阶段可为 `native` 返回现有内部协议 URL，为三个兼容档位返回 Gateway HLS 会话；Gateway 直放验收后再把 native lease 切到 HTTP Range。`useNativePlayerRuntime` 不再自行拼接任何传输 URL；它为当前 generation 调用 prepare，结果仍有效才交给 `PlayerRuntime.load`。迟到结果必须立即 `release()`。`PlayerRuntime` 是 lease 的唯一最终 owner，player-loading 只管理 durable source，不再释放 FFmpeg 播放 session。

### 4. InputFacts、CapabilityFacts 与 OutputProfile 形成分阶段规划

Main 的 ffprobe 先生成与 UI 无关的客观 `InputFacts`：容器、duration、bitrate、stream start time、视频 codec/profile/level/尺寸/帧率/pixel format/color facts，以及音频 codec/channels/sample rate。输入事实不得把位深大于 8 推导成 HDR，也不得假定 ffprobe 一定提供可用于 MSE 的 `mime_codec_string`。

Renderer 根据实际 Chromium 环境查询 `MediaCapabilities.decodingInfo`，必要时结合 `canPlayType`，生成 `CapabilityFacts`：supported、smooth、powerEfficient 或 unknown。目标 fMP4 的 RFC 6381 codec string 必须来自确定性映射或实际编译后的 init segment 探测；缺失事实不能被解释为支持。

纯 planner 不再输出任意 copy/transcode 组合，而是选择完整输出契约：

```ts
type OutputProfile =
  | { kind: 'native'; reason: string }
  | { kind: 'copy-video-aac'; startupDeadlineMs: number; reason: string }
  | { kind: 'safe-h264-aac-sdr'; reason: string }
  | { kind: 'hdr-to-sdr-h264-aac'; reason: string }
```

档位规则：

```text
容器与所有主轨道原生兼容                 → native
视频可用于目标 fMP4/MSE、音频不兼容       → copy-video-aac
HEVC supported（包括 smooth=false）       → 优先 native/copy-video-aac
仅 smooth=false/powerEfficient=false      → 仍优先原视频，不据此转码
HEVC unsupported 或原生 decode 回退       → safe-h264-aac-sdr
明确 HDR10/HLG 且必须转视频               → hdr-to-sdr-h264-aac
10-bit SDR 且必须转视频                   → safe-h264-aac-sdr，不 tone-map
```

`copy-video-aac` 是受期限约束的优化档位，不是无条件兼容承诺。它必须验证编译后的 fMP4 codec、Producer 输出和浏览器首帧；默认约 8 秒仍未进入 `playable` 时，取消当前 generation 并单次升级到 `safe-h264-aac-sdr`。该升级属于同一兼容 fallback chain，不得来回循环。

`smooth` 仅表示浏览器基于当前配置预测的流畅度，`powerEfficient` 仅作为硬解倾向；二者都不是视频转码门槛。只有 `supported === false` 才在首次规划时转码视频。实际 `MEDIA_ERR_DECODE`/`MEDIA_ERR_SRC_NOT_SUPPORTED` 可触发同一 logical source 的一次 fallback；文件不存在、权限、网络读取和用户取消不得触发转码。fallback 记录在逻辑会话而非临时 URL 上，并在替换 source 时恢复暂停、音量、倍速、旋转、字幕选择/偏移和弹幕状态。

开发构建接受确定性的 `VITE_FORCE_TRANSCODE_PROFILE=audio|safe|hdr-sdr`。其中 `audio` 选择 `copy-video-aac`，`safe` 选择 H.264 8-bit 4:2:0 + AAC-LC 的安全档位，`hdr-sdr` 只用于具有明确 HDR 色彩事实的 tone-map 链路。旧 `VITE_FORCE_VIDEO_TRANSCODE=1` 在迁移期作为 `safe` 的别名。所有强制档位同时受 `import.meta.env.DEV` 约束，不影响 Web 与生产构建。

### 5. 分阶段迁移到单个 loopback Media Gateway

Main 在应用 ready 后启动一个只绑定 `127.0.0.1` 的随机端口 HTTP 服务，应用退出时关闭。每个媒体 session 使用高熵 token；URL 只包含 token、generation 和资源名，不包含原始路径。路由通过内存 registry 映射到已登记 source/session，拒绝未知、过期、目录穿越和非 loopback 请求。

```text
/v1/media/<token>/source
/v1/media/<token>/g/<generation>/index.m3u8
/v1/media/<token>/g/<generation>/init.mp4
/v1/media/<token>/g/<generation>/segment-00001.m4s
```

迁移按以下门禁推进：

1. 第一阶段只开放 generation 下的 HLS 资源；正常 direct 仍由现有 `marchen://` Range 承担，但该 URL 只能存在于 lease 中。
2. 第二阶段实现 Gateway direct route：完整 `200` 与单区间 `206`，覆盖 `HEAD`、`start-end`、`start-`、`-suffixLength`，非法范围返回 `416`，并正确处理中断和背压。
3. 第三阶段在开发态和 macOS/Windows 打包态验证普通 MP4/MKV、seek、影视库续播、自动连播、字幕和截图；切换时保留内部协议回退。
4. 只有上述回归全部通过，才把 direct 默认切到 Gateway 并移除内部协议实现。

最终统一 Gateway 的理由是避免长期维护两套 URL、Range、安全和释放模型；分阶段切换则避免让新增 HLS 服务在尚未证明可靠时成为所有正常直放的单点依赖。localhost 需要 token、Origin/请求来源约束、精确 CORS、随机端口和会话过期；高熵 token 与 registry 可避免把服务变成任意文件服务器。

### 6. 固定 OutputProfile 编译为 fMP4 HLS，并分层验证

FFmpeg 输出短时长 fMP4 HLS：manifest、init segment 与 `.m4s` 分片先写临时文件，完整后原子发布到 session generation 目录，清单不得引用未完成分片。Renderer 使用成熟的 HLS/MSE 客户端附着现有 `HTMLVideoElement`，显式处理 ESM Worker 的打包地址、CORS、错误恢复和 destroy，而不是自己实现 SourceBuffer 队列、appendWindow、QuotaExceeded、重试和媒体错误恢复。direct 计划继续直接设置 video URL，播放器控制 UI 和 `@marchen/playback-core` 不感知具体传输。

首版默认约 2 秒分片，但不再用清单累计时长作为唯一就绪条件。`PipelineCompiler` 将固定档位编译成完整参数；`ProducerValidator` 检查 manifest、init、首段 codec、时间戳、关键帧边界和文件完整性；Renderer 随后执行 HLS.js/MSE 挂载与浏览器首帧确认。临时目录位于 app cache 下，按 session 隔离且不跨启动复用。

固定档位策略：

- `native`：继续使用当前 direct lease，不启动 FFmpeg；
- `copy-video-aac`：显式复制已验证可用于目标 fMP4/MSE 的主视频，主音频统一为 AAC-LC 48 kHz；输入 AAC 已满足完整输出契约时可直接复制，否则转码，单/双声道保持，更多声道下混立体声；
- `safe-h264-aac-sdr`：视频统一输出 H.264、8-bit 4:2:0，音频统一输出 AAC-LC；用于明确不支持、原生解码失败和强制安全测试。10-bit SDR 只做像素格式降级，不使用 HDR tone-map；
- `hdr-to-sdr-h264-aac`：仅在 transfer/primaries/matrix 等事实明确表明 HDR10/HLG 时启用受验证的 SDR tone-map，再输出 H.264/AAC；色彩事实不足时返回明确错误，不猜测转换路径。

所有重新编码视频的 HLS 参数必须形成闭合 GOP，关键帧间隔与分片目标匹配，并明确场景切换导致的关键帧策略。视频复制档位无法重写源 GOP，因此必须依赖目标 init/segment 验证和约 8 秒的浏览器首帧期限；超时升级安全档位，而不是等待整片或无界等待下一个关键帧。

H.264 编码器选择分为两步：先用有限时长 `lavfi` 合成帧验证候选编码器能真实初始化，macOS 优先 VideoToolbox，Windows 尝试 NVENC/QSV/AMF，最终回退 libx264；再用当前真实输入执行独立 pipeline preflight，验证选流、解码、色彩滤镜、音频处理、封装和时间戳。编码器初始化不得复用真实文件输入参数，也不得传入执行器未创建的 `-progress pipe:3`。

首版允许软件解码 HEVC + 硬件编码 H.264；硬件解码零拷贝链路平台差异大，不作为统一承诺。

ffprobe 必须排除 attached picture，并按 default disposition、语言信息与稳定顺序选择一个主视频和主音频轨道。首版不提供音轨切换 UI，但所有 FFmpeg 命令必须使用显式 `-map`，不得依赖 FFmpeg 的隐式自动选流。

### 7. seek 通过 generation 重启生产者，播放器保持逻辑时间线

direct 使用浏览器 HTTP Range seek。兼容会话的随机 seek 不等待从视频开头继续生成：Renderer 以原视频目标时间请求 session seek，Main 停止旧 generation 的 FFmpeg，从目标附近重新启动并返回新 generation manifest。Renderer 停止旧 HLS 加载后切换 generation；generation id 阻止旧请求和迟到分片混入新时间线。

转码流的媒体元素可能从零开始计时，因此 session 需要记录请求 seek、实际首个输出 PTS 和原始 stream start time，Media adapter 再向 `playback-core` 暴露校准后的逻辑快照：

```text
logicalCurrentTime = calibratedGenerationOffset + element.currentTime
logicalDuration    = ffprobe originalDuration
```

反向 seek 将逻辑 target 交给 session controller，而不是直接写入旧 generation 的 `video.currentTime`。不能仅用请求 target 作为 offset，因为关键帧、B 帧、VFR 和非零 start time 会引入偏差。`PlaybackSource.startTime`/timeline contract 需要真正接入 `PlaybackSession`，或由兼容 MediaPort 在边界完成映射；无论采用哪种实现，history、danmaku、subtitle、controls、ended 与 watched threshold 只能看到原始逻辑时间线。

### 8. 原始媒体引用服务影视库、截图、字幕和播放列表

HISTORY.path 保存原始 Electron 路径，永不保存 lease.url。数据库新增版本迁移旧 `marchen://` 路径，保留 hash、进度、弹幕、字幕和匹配数据；Windows 盘符和 UNC 使用旧解析规则尽可能恢复，无法无歧义恢复时保留记录并在续播时报错，不能猜测其他文件。

影视库仍以 episode.fileHash → HISTORY 查找路径。progress/duration 使用逻辑时间线；lastWatchedEpisodeId/At 从 player-loading 数据准备阶段移动到媒体首次 ready/playing 后，转码首片失败不能把作品顶到继续观看最前或覆盖旧进度。

截图、ffprobe 字幕列表、内嵌字幕提取和附近字幕匹配都接收 durable source/path 与逻辑时间，不接收 HLS/localhost URL。播放列表 entry 增加稳定 source identity，优先按 fileHash 匹配，未取得 hash 时按规范化原始路径匹配；自动下一集仍进入统一 player-loading → source prepare 流程。

### 9. 外部深链先下线，内部媒体协议门禁后移除

首先删除 `app.setAsDefaultProtocolClient('marchen')`，因为它是外部深链注册，与内部 `protocol.handle` 和 mp4/mkv 文件关联无关。第一阶段继续保留内部媒体 handler 作为正常直放与 Gateway 切换失败时的回退，但 Renderer 不再自行拼接协议，HISTORY 也不得保存协议 URL。

Gateway direct 通过开发态与 macOS/Windows 打包态回归后，才删除 Main 的路径 URL 解析、媒体 `protocol.handle('marchen')`、特权协议注册和 `bypassCSP`。现有 mp4/mkv file association 与 macOS `open-file`、Windows second-instance 原始路径入口继续工作。未来如新增深链，应作为独立能力，以命令和 opaque id 表达，不接受任意本地文件路径。

### 10. capability 与状态只在浏览器首帧确认后开启

`electronPlayerCapabilities.ffmpegPlayback` 不能因二进制存在就直接为 true。启动自检成功、Gateway 就绪且会话 API 注册后才报告兼容后端可用；Web 永远为 false。单次会话状态至少区分 planning、encoder-check、producing、producer-ready、attaching、playable 和 failed。FFmpeg 进程启动、manifest 出现或首段落盘都不是播放成功；只有 HLS.js 建立 SourceBuffer、`loadedmetadata` 提供有效 duration，且浏览器通过 `requestVideoFrameCallback` 或等价证据解码出首帧后，才能进入 `playable`。

失败必须保留 probe、encoder-check、pipeline-preflight、transcode、manifest-validation、MSE、metadata 或 decode 阶段、退出码与有界诊断摘要。产品 UI 可以展示简化中文文案，但不能把所有失败折叠成黑屏 `0:00`。

### 11. 临时资源采用预算、TTL 与启动清扫

每个 session/generation 使用独立缓存目录和容量预算。创建会话前检查可用空间，运行中跟踪已写入规模；超过预算或空间下限时终止生产者并返回可恢复错误。应用启动时只清扫带 Marchen 会话标记且超过 TTL 的孤立目录，不能对宽泛缓存路径递归删除。

正常退出依赖 lease、window/renderer lifecycle 与 app quit 清理；SIGKILL 或断电无法在现场清理，因此必须由下次启动的幂等 scavenger 收口。系统 sleep/resume 后检查 FFmpeg 进程、Gateway 会话和 HLS 消费者状态：能够继续则恢复，否则释放旧 generation 并允许从逻辑时间重试。

## 风险与权衡

### Media Capabilities 不是硬件事实证明

浏览器可能在没有设备历史数据时乐观报告 smooth/powerEfficient，也可能因历史掉帧报告 `smooth: false`，或因隐私与实现差异给出 unknown。设计接受“supported 不为 false 时原生优先 + 实际 decode 错误单次回退”，而不是把预测流畅度当作兼容性门槛。验收需要覆盖能力误报、`smooth: false` 和开发态强制视频转码。

### fMP4 HLS 增加依赖，Producer 成功也不等于 Chromium 可播放

成熟 HLS/MSE 客户端增加 Renderer 依赖和一层事件适配，但显著降低自研 SourceBuffer、buffer eviction、seek、重试和 codec change 的风险。FFmpeg 能结束、manifest 能解析或分片能被 ffprobe 打开，都不能证明 HLS.js/Chromium 能建立 SourceBuffer 并解码首帧，因此必须增加浏览器确认。分片越短启动越快但文件/请求开销越高；首版以实测调节。

### 固定安全档位会增加 CPU、启动时间和画质损失

`safe-h264-aac-sdr` 牺牲“只处理最少轨道”的理论最优性，换取 H.264 8-bit 4:2:0 + AAC-LC 的确定输出。它在软件回退时可能无法实时处理 4K/高帧率文件，也会产生二次编码损失。设计只在明确不支持、原生解码失败、优化档位超时或开发态强制时使用，并保留可观察的进度和失败，而不承诺所有输入都能实时转码。

### 视频复制优化档位受源 GOP 约束

`copy-video-aac` 无法改变源视频关键帧布局，长 GOP、异常时间戳或目标 fMP4 codec 表达可能让 FFmpeg 很快产出文件但浏览器迟迟没有首帧。默认约 8 秒期限会让部分最终可播放的输入提前升级为全视频转码，这是启动可预测性与算力消耗之间的取舍。期限应由真实样本测量后调整，但不能取消上限。

### 编码器自检与真实 pipeline preflight 会增加少量准备成本

合成帧自检能隔离硬件编码器可用性，真实输入 preflight 能提前发现解码、色彩滤镜、选流和封装错误，但二者会增加一次或两次短进程启动。实现应缓存与设备/编码器相关的自检结果，真实文件验证保持有界，不能把整部预转码当作 preflight。

### Electron 首帧 E2E 增加测试时长与平台差异

单元测试和 ffprobe 结构测试无法覆盖 Chromium MSE 行为。Electron E2E 必须等待 `loadedmetadata`、首个解码帧、时间推进与 seek 后继续播放，会比当前 2 秒小样本更慢，也可能暴露硬件编码器差异。测试矩阵应以稳定的 30–60 秒结构样本为主，将用户本地真实文件作为不入库的 smoke gate，并在平台产物上分别记录结果。

### 分阶段迁移会暂时保留两套传输

过渡期 direct 使用内部协议、兼容流使用 Gateway，会增加短期测试矩阵；代价用于换取普通直放的稳定回退。两套传输不得扩散到业务层，必须收口在 `SourceLifecyclePort` 和 lease 中，并以 Gateway direct 打包态验收作为删除旧协议的明确门禁。

### seek 重启可能出现关键帧偏差和短暂停顿

快速 input seek 可降低准备时间，但 copy/remux 的精确切点受关键帧限制，重新编码也需要解码预滚。逻辑时间必须基于目标 offset 与实际首帧校准，验收关注字幕/弹幕同步和前后连续性，而不仅是控件显示的目标数字。

### 不同平台完整构建能力并不完全一致

同为“full”构建也可能缺少某个硬件接口或外部库。清单与 runtime self-check 只承诺项目需要的最小集合，硬件编码始终带真实初始化和 libx264 兜底。平台资源会显著增加安装包体积，但每个产物只携带单架构，避免线性叠加所有目标。

### localhost 服务扩大本机攻击面

随机端口本身不是权限边界。必须绑定 loopback、高熵 token、内存 registry、严格 route、无路径拼接、限制跨域来源、会话过期与连接取消清理。验收包含未知 token、目录穿越、非 loopback 与释放后访问。若这些约束无法可靠实现，应回退为 opaque custom scheme，而不是暴露低熵 HTTP 文件服务器。

### 历史路径迁移在 Windows 存在歧义

旧 `marchen://` 把 drive、host 与 UNC 混在 URL 语义中，一些记录可能无法无损还原。迁移要保守、可重复，并在 Main 打开文件时继续短期兼容旧格式；不可恢复记录应提示重新定位文件，不能丢弃对应的进度、匹配和弹幕数据。

### 资源所有权改造触及当前运行时边界

把正常播放接入异步 SourceLifecycle 会同时触及 player-loading、PlayerRuntime、Strict Effects 和 Web Blob lease。需要先用 direct/Web 回归证明所有权收敛，再接 FFmpeg；否则转码问题会与基础 source 泄漏混在一起。释放必须幂等，并覆盖迟到 prepare、快速换片、路由退出、window close 和 app quit。

### 转码画质、耗电与温度不可忽略

当 HEVC 硬解不可用时，实时 H.264 转码可能无法追上 4K/高帧率源。系统应公开 preparing/progress/error，并允许最终失败；首版不承诺所有样本实时。硬件编码质量与色彩处理需要真实 SDR/HDR 样本验证，避免静默色偏或错误 tone mapping。

### Linux 不在本次支持范围

仓库当前仍保留 Linux AppImage 配置，但本变更不准备 Linux FFmpeg 资源、不声明 `ffmpegPlayback` 可用，也不把 Linux 构建结果作为交付门禁。若决定正式停止 Linux 发布，应由独立变更删除发布脚本和构建配置，避免混入媒体兼容实现。
