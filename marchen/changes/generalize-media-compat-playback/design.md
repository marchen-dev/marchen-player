## 背景

`add-ffmpeg-compat-playback` 已经把 Marchen 从“Renderer 直接拼 URL + 零散 fluent-ffmpeg 调用”迁移到可演进的本地媒体后端：Main 持有固定 FFmpeg runtime、probe/executor/scheduler、Media Gateway、缓存预算、媒体 session 与 HLS producer；Renderer 通过 SourceLifecyclePort 获得 lease，并使用 HLS.js/MSE 确认浏览器首帧。正常直放仍可保留现有内部 Range 协议，不要求本变更统一到 localhost。

当前兼容决策以 `native`、`copy-video-aac`、`safe-h264-aac-sdr`、`hdr-to-sdr-h264-aac` 四个组合档位为边界。这个模型已验证 HEVC/EAC-3 的代表场景，但把输入能力、轨道动作、输出契约和 fallback attempt 混在同一个枚举中：

- Renderer 只针对当前主轨道查询能力，没有可复用的客户端 Profile；
- codec string 确定性映射覆盖 H.264/HEVC 与常见音频，其他 codec 容易落入 unknown；
- runtime 虽执行 `-decoders/-encoders/-filters/-formats`，但只保留元数据预声明子集，decoder 目录没有进入 planner；
- 音频兼容档位固定转 AAC，视频转码档位也不能自然表达 audio copy；
- `copy-video-aac` 约 8 秒没有首帧就整体升级视频转码，无法区分关键帧等待、producer、MSE 与真实 decode 不兼容；
- FFmpeg 维护 EVENT 清单并持续生产，seek 释放旧 generation、创建新 URL 和重新挂载 HLS；单会话预算只能限制最坏增长，不能主动控制 ahead window。

Jellyfin Web/Server 的可复用机制是：客户端生成 DeviceProfile；服务端以输入媒体事实逐项匹配 Direct Play、Direct Stream 和 Transcode；视频与音频分别决定 copy/transcode；动态 VOD 清单把 segment index 映射到逻辑时间，缺失 segment 请求再启动或重定向 FFmpeg Job；Job 通过活动请求、心跳、生产/消费位置管理停止、节流和清理。

本设计借鉴这些机制，但不照搬 Jellyfin 的服务端产品边界。Marchen 是单用户本地 Electron 应用，仅支持 macOS/Windows；固定一个本地客户端、一个 loopback Gateway 和一个前台播放会话。Marchen 现有 token/registry、临时文件原子 rename、Producer Validator、两阶段 playable 确认和逻辑时间线校准应继续保留。Jellyfin 同样存在请求锁和输出等待机制，不以“文件出现即可返回”概括其行为；是否可靠以各自真实输出和播放证据判断。

## 目标与非目标

**目标：**

- 让任意 Chromium 明确不支持、但 bundled FFmpeg 能解码的本地视频自动进入 H.264/AAC 兼容播放，不再以 HEVC 名称作为触发条件。
- 建立稳定、可序列化、可测试的 ClientPlaybackProfile、InputMediaFacts、FfmpegRuntimeCapabilities 与 PlaybackDecision 边界。
- 独立决定容器、视频和音频动作，最大限度 copy 已兼容轨道。
- 通过服务端 VOD 时间线和请求驱动 segment 生产缩短首帧与 seek，不让快速管线默认生成完整影片。
- 把 FFmpeg 进程升级为有覆盖范围、活动请求、心跳、生产位置、消费位置与缓存窗口的 Playback Job。
- 保留软件视频解码作为通用兜底；硬件解码/编码是可验证优化，失败不得破坏软件兼容承诺。
- 让播放信息能够说明“为什么处理、处理了哪条轨道、实际用了什么 decoder/encoder、慢在哪个阶段”。
- 用真实长视频覆盖 HEVC、AV1、VP9、VC-1、MPEG-2、音频不兼容、HDR、长 GOP、VFR 和非零时间线。

**非目标：**

- 不实现 Jellyfin 的媒体服务器、用户权限、远程 URL、Live TV、ISO/DVD/Blu-ray、跨设备 session 或共享转码。
- 不实现多码率 ABR、质量菜单、网络带宽自适应或同时生产多个清晰度。
- 不以 HEVC/AV1 作为兼容输出；兼容视频固定输出 H.264，兼容音频固定输出 AAC-LC。
- 不适配 Linux、Tizen、WebOS、Xbox、PlayStation、移动端或电视端硬件矩阵。
- 不强制把正常 Direct Play 从现有内部 Range 协议迁移到 Gateway；旧 change 中 Gateway direct 默认化和内部协议删除不是本变更前置条件。
- 不建立跨启动可复用的转码媒体缓存；允许持久化有版本和源指纹约束的 probe/关键帧元数据缓存。
- 不默认烧入文本或图形字幕；现有独立字幕渲染能力优先，只有未来明确无法交付的字幕格式才另行讨论烧入。

## 决策

### 1. 使用四类事实与一个纯协商边界

播放准备按以下数据流组织：

```text
DurableMediaSource
      │
      ├─ Main probe ───────────────→ InputMediaFacts
      ├─ Renderer runtime probe ───→ ClientPlaybackProfile
      └─ FFmpeg startup audit ─────→ FfmpegRuntimeCapabilities
                                          │
                 CompatibilityNegotiator ←┘
                          │
                          ▼
                   PlaybackDecision
                          │
                          ▼
                    PipelineCompiler
```

`InputMediaFacts` 继续由 Main 产生客观事实，包含源指纹、容器、duration/start time/bitrate、主轨道选择以及所有视频/音频/字幕事实。它不包含浏览器支持推断。

`ClientPlaybackProfile` 由 Renderer 针对当前 Electron Chromium 构建，并区分：

- 原始容器 Direct Play profile；
- fMP4 HLS/MSE profile；
- 视频 codec 条件：RFC 6381、Profile、Level、位深、动态范围、分辨率、帧率；
- 视频内音频条件：codec、Profile、声道、采样率、位深；
- 字幕交付：独立渲染、外部 text track、drop；
- 原始 supported/smooth/powerEfficient 证据及来源。

Profile 在当前 Renderer 内按 Electron/Chromium 版本、平台、轨道条件与探测传输类型缓存，不跨启动持久化设备能力。file 证据不得直接复用为 MSE 支持结论；候选 fMP4 视频与音频分别查询目标传输能力，最终输出组合另行验证。未知结果保留 unknown，不能以 canPlayType 的 file 结果冒充 MSE 支持。Web 构建生成只含浏览器能力且 `localCompatibilityAvailable=false` 的 Profile。

`FfmpegRuntimeCapabilities` 改为解析当前二进制实际输出的完整 decoder、encoder、filter、demuxer、muxer、protocol 与 hwaccel 集合；固定 runtime metadata 仍作为发布清单和最低能力门禁，但不再限制运行时目录只能看预声明名称。planner 使用 codec alias 表把 ffprobe codecName 映射到 decoder candidates，并在正式 Job 前用真实输入 preflight 证明可用。

`CompatibilityNegotiator` 保持纯函数。它不生成 FFmpeg 参数，只产生动作、原因和候选策略；这允许用合成 Facts 覆盖大量 codec/条件组合，而不依赖 Electron 或真实 FFmpeg。

### 2. PlaybackDecision 使用正交动作，不扩张组合枚举

新的共享决策形态为：

```ts
interface PlaybackDecision {
  method: 'direct-play' | 'direct-stream' | 'transcode'
  container: { action: 'direct' | 'remux'; target?: 'fmp4-hls' }
  video: {
    streamIndex: number
    sourceCodec: string
    action: 'copy' | 'transcode'
    targetCodec?: 'h264'
    decoderMode?: 'auto' | 'hardware' | 'software'
    toneMap?: 'none' | 'hdr-to-sdr'
  }
  audio?: {
    streamIndex: number
    sourceCodec: string
    action: 'copy' | 'transcode'
    targetCodec?: 'aac'
  }
  subtitle: { action: 'external-render' | 'drop' }
  reasons: CompatibilityReason[]
  trial: boolean
}
```

协商顺序对齐 Jellyfin 的优先级但简化到本地客户端：

1. 完整原文件支持 → Direct Play；
2. 原容器不支持但目标 fMP4 中视频/音频均可 copy → Direct Stream/remux；
3. 视频可 copy、音频不可 copy → Direct Stream/copy video/transcode audio；
4. 视频不可 copy 且 FFmpeg 能解 → Transcode video，音频独立决定 copy/transcode；
5. 必要 decoder/encoder/filter 不可用 → 规划阶段结构化失败。

unknown 不等于支持，也不立即等于不支持：原文件有合理直放入口时生成 `trial=true` 的 Direct Play；实际 `decode`/`src-not-supported` 证据再把同一 logical source 推进到一次兼容 attempt。`smooth=false` 与 `powerEfficient=false` 只进入诊断，不改变 method。

四个旧 OutputProfile 在迁移期由 adapter 转换成新决策，所有新调用方切换后删除。播放模式和用户可见统计从新决策派生，不能再以 profile 字符串作为业务真相。

### 3. codec string 使用确定性映射、能力探测与 target probe 三层来源

RFC 6381 处理按以下顺序：

1. 使用 ffprobe 明确提供的 `mime_codec_string`；
2. 对可可靠表达的 H.264、HEVC、AV1、VP8/VP9、AAC、AC-3/EAC-3、FLAC、Opus 等使用确定性映射；
3. 对需要容器 extradata 或规则不足的 copy candidate，执行有界短 remux，读取目标 init 的真实 codec string 与 sample entry；
4. 仍无法确认则保持 unknown，只允许原生 trial 或选择转码，不允许未经验证 copy 到 fMP4。

target probe 仅在候选 copy 缺少必要 codec/init 事实时执行；已确定的普通直放不等待兼容管线预检。target probe 结果按源指纹与 pipeline target 缓存。源指纹至少包含规范路径、size、mtime、主轨道 index 和 probe schema version；源变化立即失效。

### 4. PipelineCompiler 只处理动作，输入 codec 由 decoder catalog 决定

PipelineCompiler 接收 PlaybackDecision 和实际 runtime choice，生成以下有限输出：

```text
remux:            video copy + audio copy
audio compatible: video copy + audio AAC-LC
video compatible: video H.264 + audio copy/AAC-LC
HDR compatible:   HDR10/HLG → SDR H.264 + audio copy/AAC-LC
```

输入可以是 HEVC、AV1、VP9、VC-1、MPEG-2 或 runtime 声明并通过 preflight 的其他 codec。除了 codec alias、bitstream filter、色彩/硬件限制外，不为每个输入创建 OutputProfile。

decoder 策略：

- `software` 明确使用 FFmpeg 原生软件 decoder 或禁止 hwaccel；这是兼容承诺的最终兜底；
- `hardware` 只允许已声明、已初始化并通过真实输入 preflight 的平台路径；失败直接报告该强制模式失败；
- `auto` 可按设置尝试硬件 decoder，失败后回退软件 decoder。首版 macOS/Windows 只实现项目能够用真实样本验证的候选，不承诺 Jellyfin 全部硬件矩阵。

encoder 继续按真实初始化选择平台 H.264 encoder，再回退 libx264。macOS AAC 按 `aac_at` → bundled software AAC 的顺序实际初始化；不引入未随 runtime 发布的 encoder 作为强依赖。

HDR10/HLG 只有在必须视频转码且客户端不能保留原动态范围时 tone-map。Dolby Vision 首版不作通用 tone-map 承诺：若 base layer 能按普通 HEVC/AV1 明确处理，可在移除不兼容动态元数据后通过独立验证；否则返回 `video-range-not-supported`，不能输出颜色不可信的视频。

### 5. 服务端生成稳定 VOD 时间线，FFmpeg 清单降为内部产物

兼容会话对 Renderer 暴露稳定入口：

```text
/v2/media/<token>/index.m3u8
/v2/media/<token>/init.mp4
/v2/media/<token>/segments/<index>.m4s
```

入口不包含 FFmpeg generation。Gateway 根据内存 session registry 动态生成 VOD manifest：总时长、segment index、逻辑 start/end、init URI 与媒体 URI 在 session 建立后稳定。Renderer 只加载一次 HLS URL；普通 seek 由 HLS.js 根据 VOD 时间线请求目标 segment，不再要求 SourceLifecyclePort 返回新 lease。

视频转码时，PipelineCompiler 形成与目标 segment duration 匹配的闭合 GOP，时间线可按等长目标加尾段生成。

视频 copy/remux 时，使用源关键帧按累计目标切点生成计划时间线；该时间线与 Job 的实际分片范围分别记录，按后文发布与客户端验收约束处理重启后的边界变化：

- MKV 优先读取 Matroska cues/cluster metadata，避免全文件包扫描；
- 其他容器或 metadata 缺失时可使用有界/可取消的 ffprobe keyframe 提取；
- keyframe 结果按源指纹缓存；
- 无法在准备期限内得到可靠关键帧时，不把固定 2 秒边界当成独立分片承诺。按第 11 节准备期限回退 v1 EVENT transport 或明确失败；索引慢本身不得触发视频转码。只有视频不支持、实际 decode 失败、用户强制转码或动态 copy 永久无法形成安全边界时，才按明确原因考虑转码。

已有 spike 提供关键帧提取与稳定 VOD 的可行性证据，正式管线仍需对真实长片、MP4、长 GOP 和非零时间线重新验收。本版生成稳定完整 VOD 时间线，不在已交付客户端后扩展或重写分片边界。

### 6. SegmentStore 与 PlaybackJobManager 分离

`SegmentStore` 管理 session 内逻辑 segment index 到已发布资源的映射。每个 Job 在独立工作目录写临时 init/segment；Publisher 继续依赖 FFmpeg `temp_file` 原子 rename，执行 Producer Validator 后才原子提升到 SegmentStore。稳定 manifest 只引用逻辑 endpoint，不直接暴露工作目录文件名。

`PlaybackJobManager` 以 `(sessionId, pipelineFingerprint)` 管理当前 Job：

```text
idle → starting → producing ↔ throttled → stopping → stopped
                    │              │
                    └──────────────→ failed
```

Job 记录：jobId/epoch、覆盖的 segment 起点/终点、requested start、实际首 PTS、已发布位置、FFmpeg 进度、下载请求位置、播放器逻辑位置、decoder/encoder、activeRequestCount、客户端活动时间、stderr tail 与退出原因。FFmpeg progress 不刷新客户端活动时间；下载位置不等同于播放器 currentTime。

segment 请求流程：

1. 已发布 → 直接返回并更新下载请求位置；播放器逻辑位置通过独立会话报告获得，不能从分片预取反推；
2. 当前 Job 正在覆盖目标 → 注册 waiter，等待原子发布或失败；
3. 没有 Job、反向请求或目标超出当前 ahead window → 在 session 锁内等待活动响应安全点，停止旧 Job并从目标 segment 附近启动；
4. 请求取消只移除对应 waiter，不自动误杀仍服务其他请求的 Job；
5. Job 失败结束该 Job 所有未完成生产状态并唤醒相关 waiter，返回结构化阶段错误；会话终止才取消整个 session 的 pending 请求。

Job 重启必须产生与 session pipeline fingerprint 兼容的 init。Publisher 对 codec、sample entry、track id、timescale 和 extradata 做 fingerprint 校验；不兼容时不得覆盖稳定 init，而是使当前 attempt 失败并交给有限 fallback。这样 seek 不需要修改 manifest 或偷偷混用不同初始化段。

### 7. 默认控制 ahead window，但分片删除分阶段启用

Jellyfin 默认关闭 throttling 和 segment deletion，因此快速管线会生成完整影片；Marchen 的本地场景将有限 ahead window 作为默认行为，而不是可选服务器优化。

统一采用第 11 节的初始门槛：20 秒恢复、60 秒暂停/停止、90 秒硬上限。先以真实 stop/restart 验证媒体连续性，再接入 ahead；pause/resume 作为平台验证后的优化。恢复点从当前有效请求或播放位置附近的连续已发布窗口末端计算，不从全局第一个 missing/evicted 分片恢复。

旧分片删除晚于动态再生上线：

- 第一阶段保留 session 内全部已消费分片，但停止无界 ahead 生产；
- 第二阶段在反向 seek 再生成验收通过后，保留有限 back window 并清理更旧分片；
- 缓存预算或磁盘下限触发时优先清理可再生旧分片，再节流/停止 Job，最终才使会话失败；
- lease 释放仍删除整个 session；应用启动只清理带有效 marker 的孤立目录。

probe/keyframe metadata cache 与媒体 segment cache 分离，前者可跨启动复用且按源指纹/version 失效，后者不跨启动承诺。

### 8. 回退从“profile 升级”改为 logical attempt chain

同一 logical source 的最大链路为：

```text
Direct Play trial
  → Direct Stream（只有 container/audio/copy 组合可证明）
  → Full compatible transcode
  → terminal error
```

首次协商已经明确视频不支持时直接进入 Full compatible transcode，不必逐级试错。Direct Stream 的 producer/MSE/decoder 失败可进入 Full compatible transcode 一次；Full compatible transcode 失败不回到 copy。网络、权限、源文件变化、磁盘不足、用户取消与租约释放不触发 codec fallback。

切换 attempt 时 SourceLifecycle owner 保持同一 logical media state，恢复 logical currentTime、暂停、音量、倍速、旋转、字幕选择/偏移和弹幕时钟。兼容 session 内普通 seek 不产生新 attempt，只改变 Playback Job。

旧 `copy-video-aac` 固定 8 秒升级逻辑在动态 HLS 首帧指标上线后移除。新期限按阶段报告：profile/probe、keyframe、preflight、job start、segment ready、MSE attach、browser first frame；是否触发 fallback 由错误类型决定，而不是单一总计时器。

### 9. 观测模型同时服务播放信息和验收

每次 attempt 记录：

- method 与 compatibility reasons；
- container/video/audio/subtitle action；
- 输入/输出 codec、Profile、Level、位深、动态范围；
- decoder/encoder 名称与 software/hardware class；
- capability 来源与 unknown 字段；
- probe/keyframe/preflight/job/segment/MSE/first-frame/seek 各阶段耗时；
- 当前生产位置、消费位置、ahead、缓存字节、active requests；
- 有界 stderr 和退出原因。

播放信息只展示必要诊断，不暴露 token、缓存真实路径或完整用户路径。开发态强制配置归一为一个结构化 override：method、decoderMode、encoderMode；旧环境变量迁移映射后废弃。生产和 Web 构建必须忽略这些 override。

### 10. 分阶段迁移并保留可回退基线

实施分为门禁明确的阶段：

1. **旧 seek 恢复（tasks 第 11 组）**：修复失败 Promise 链、结束失败 seeking、合并过期拖动目标，保留可用迁移基线。
2. **正确性校准（第 12 组）**：分离 file/MSE 证据，统一正式 compiler 与实验参数，验证时间线、实际分片和跨 Job init。
3. **Job 所有权（第 13 组）**：以 epoch 关联生产与发布，处理替换、失败、取消和迟到输出，证明不会等待已消失的生产者。
4. **真实应用接入（第 14 组）**：在开发开关下接通 HEVC copy + EAC-3→AAC 的完整 v2 链路，验证连续前后 seek，再扩展软件视频转码与独立音频动作。
5. **资源与性能（第 15 组）**：先证明 stop/restart 连续，分离客户端活动与生产进度，接入 ahead，再验收反向再生和 back window；最后优化探测缓存和硬件候选。
6. **默认切换与清理（第 16 组）**：以真实应用、业务回归和 macOS/Windows 打包态证据切默认；保留一个版本周期的显式旧 transport 回退，回退期结束后才删除仍被它依赖的旧实现。

迁移期间同一媒体只能由一种 HLS session implementation 持有，禁止两个 producer 同时写同一缓存或由 Renderer 混合两个 lease。旧 change 尚未完成的 Gateway direct 默认化、内部协议删除继续暂停，不阻塞本变更。

### 11. 第一版运行门槛

Spike 冻结以下初始值，机器可读配置与依据保存在 `spikes/08-initial-thresholds.md`：

| 范围                | 目标/门槛                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| metadata 关键帧优选 | 2 秒；冷关键帧准备总硬期限 8 秒                                                                  |
| segment             | copy video 目标 6 秒、transcode video 目标 2 秒；metadata 最大 gap 12 秒，动态 copy 硬上限 30 秒 |
| 首段                | Job 启动后目标 1 秒、硬期限 3 秒                                                                 |
| 浏览器首帧          | segment 可用后目标 1.5 秒、硬期限 5 秒；warm prepare 总目标 3 秒、硬期限 8 秒                    |
| seek                | 恢复目标 1.5 秒、硬期限 5 秒                                                                     |
| segment waiter      | 10 秒后结构化超时                                                                                |
| ahead               | 20 秒恢复、60 秒暂停/停止、90 秒硬上限                                                           |
| idle/back           | 无请求/心跳 60 秒停止；未来分片删除保留 120 秒 back window                                       |

seek 恢复硬期限用于终止当前 seek 等待并退出 seeking；较长的 segment waiter 期限不得让 UI 永久等待，客户端取消应移除对应 waiter而不误杀共享 Job。性能目标超出只产生 degraded 证据，不自动把 supported 视频升级为转码。冷关键帧超过硬期限时迁移阶段回退 v1 EVENT transport 并允许后台缓存；decoder/profile 明确不支持或实际 decode 失败才进入视频兼容转码。

## 风险与权衡

- **关键帧提取可能抵消首帧收益**：长文件 ffprobe 包扫描可能很慢。优先 Matroska metadata、指纹缓存和可取消任务；是否允许增量清单必须用 HLS.js 实验决定。
- **视频 copy 的 segment 边界比转码复杂**：错误的 VOD 时间线会造成 404、音画跳变或 seek 偏移。关键帧/PTS/segment index 必须作为一组验证，不能只检查文件存在。
- **FFmpeg 重启后的 init 可能变化**：硬件 encoder、timescale 或 extradata 变化会让旧 SourceBuffer 不兼容。通过 pipeline/init fingerprint 拒绝混用；必要时把“重新附着 HLS”作为 attempt fallback，而不是普通 seek 默认行为。
- **通用 decoder 目录不等于真实可用**：`-decoders` 只证明构建包含实现。真实输入 preflight 必不可少，但会增加启动成本；probe 与 preflight 结果应按源指纹和 pipeline 缓存。
- **硬件加速平台差异大**：auto 可能在某些机器更慢或色彩错误。软件 decoder 是正确性基线，硬件路径必须逐平台白名单并可强制关闭。
- **HDR/Dolby Vision 容易产生错误色彩**：HDR10/HLG 只在事实完整时 tone-map；Dolby Vision 不做未经验证的通用承诺。
- **默认 ahead 控制增加进程状态复杂度**：pause/resume 兼容性不可靠时需要 stop/restart，可能增加边界 segment 延迟。设计允许不同控制策略，但对用户暴露同一生产窗口语义。
- **分片清理与反向 seek 有数据竞争**：清理必须受 session 锁、活动请求计数和 back window 约束；动态再生成未证明前不启用。
- **客户端 Profile 仍可能误报**：保留 unknown trial 与实际错误回退，但 attempt 必须有限，避免把权限/磁盘问题误判为 codec 问题。
- **新旧 change 重叠**：新 change 依赖旧基础代码但替换其 planner/HLS 上层。任务必须先建立行为基线和 feature flag，逐阶段删除旧实现，避免已完成测试被一次性推翻后失去回退面。
- **“支持 Jellyfin 支持的输入”不能理解为无限容器承诺**：兼容转码可扩展到 runtime 可解码 codec，但用户导入入口首阶段仍以项目确认的本地文件容器为准；扩展 AVI/TS/MOV 等导入后缀应在同一 Facts/Negotiator 下逐项验收。

## 本次修订的实现约束

### 分片身份与正式输出

预生成 VOD 清单可以列出尚未生产的逻辑端点；这些端点只能在资源完整且验证通过后返回媒体，不能暴露工作目录或半成品。Publisher 读取内部 manifest 的 EXTINF，并结合实际媒体时间信息核对计划起止、实际覆盖、尾段与 init fingerprint；仅文件名和文件存在不足以证明 segment 身份。

保留 HLS muxer，以累计目标切点生成稳定清单。计划边界与实际媒体范围不等同：不规则关键帧下，从不同起点启动的同编号分片可能有不同边界。撤销“跨 Job 同编号必须覆盖相同逻辑范围”的统一前提；仅对正式管线和客户端版本已验证的边界变化放行，并记录适用条件与界限。未验证或超出界限的输出仍需拒绝或走明确回退，不以无错误或 currentTime 推进推断兼容。

Publisher 继续核对 EXTINF、实际音视频 PTS/覆盖、尾段和 init fingerprint，禁止将内容放到错误逻辑位置、引入不可恢复缺口或不兼容 init。当前已发布资源不得覆盖；清理后再生成必须额外验证与客户端缓存、相邻已发布片段的衔接。不能修改已交付 VOD 清单掩盖错位，也不能把所有边界差异都当作几毫秒测量误差。帧率、时间基和音频延迟的数值容差，与已验证的切片范围变化分别定义。

正式动态 fMP4 compiler 应承接 spike 中验证的 `-avoid_negative_ts disabled` 与 `-hls_segment_options movflags=+frag_discont+skip_sidx`，结合 bundled 版本验证时间戳与 seek 参数。后续媒体实验复用正式 compiler、publisher、router，禁止维护另一套仅实验可用的参数。旧 EVENT transport 保持明确边界，不能无验证地把 v1 preset 当作 v2 输出契约。

### Job 所有权与进程控制

SegmentStore 的 producing 关联 jobId/epoch。替换或停止 Job 时，在串行操作内结束其未完成生产状态：有有效需求的分片重新调度，无需求的分片回到可请求状态；失败则以结构化错误唤醒相关 waiter。发布必须核对 epoch，迟到回调不得把旧生产状态写入新 Job。请求取消只影响对应等待，session release 拒绝新请求并终结全部待处理操作。

stdin 优雅停止要求实际开启 pipe 且启动参数允许交互，不能同时保留 `-nostdin` 却声称 q 已生效。平台不支持时使用明确的信号/强制终止策略，按退出证据分类主动停止与异常失败，并保证未完成输出不被发布。

### seek 与观测责任

迁移期 generation seek 的一次失败不得污染后续 Promise 队列；若后端会话已不可恢复，应重建租约或明确报告需重试，不复用失效 generation。连续拖动以最新用户目标为准，未开始的过期操作应合并，已经开始的操作按安全取消规则处理。seek 失败必须退出 seeking，保留暂停、音量、倍速等意图，不把日志回调当成错误状态处理。v2 普通 seek 保持同一 lease，不复用 generation 换源流程。

诊断区分 configured planner、executed planner、transport 和实际 Job；shadow 决策不能展示为已执行。播放器位置、下载请求位置、连续可用窗口与 FFmpeg progress 分开记录，ahead 使用当前需求附近的可用范围；稀疏的远端已发布分片不能被当作中间全部可播放。旧分片清理依据明确的回看位置并保护活动响应，乱序预取不得推进用户的回看窗口。

### 证据分层

历史 spike 和已有模块测试保持原貌，分别标记模块验证、独立浏览器实验、真实应用入口、真实长片连续操作和打包态。模块存在、类型通过或独立 server 能播不能代替应用入口验收。第 16 组原应用回归项重新打开，记录实际执行方案与证据路径；缺样本/缺平台明确为未验证，不能推算通过。

### 尾段 seek 与客户端验证

不照搬 `min(target + 0.5, duration - 5)`。Job 的计划起点、实际输入 seek、输出首关键帧和 start_number 必须一并核对；不能将尾段请求提前到其他关键帧却未经验证沿用末段编号。首版保持目标分片附近的有效关键帧起点，单独验证最短尾段、靠近 EOF 的偏移和非零源起点。`+0.5 秒` 只有在对应样本/管线证明改善命中且不破坏目标覆盖时才采用，不能作为默认通用修复。

验收必须同时确认目标可达、画面对应原媒体时间、音视频连续与原始总时长可信；覆盖片尾→片头、从中间持续播放跨多个片段、清理后再生及跨 Job 混合缓存。记录 FFmpeg、Electron/Chromium 和 HLS.js 版本，不能只读 video.error 或计数解码帧。带整数秒标记的合成实验采用 1.5 秒读数阈值，只用于发现明显错位，不是产品 seek 精度、PTS 容差或音画同步标准；正式误差需用帧级时间证据定义。

2026-09-05 独立实验在 bundled FFmpeg 9.0.1 上观察到：0.5 秒偏移未消除跨 Job 边界变化；含片尾钳制时 HLS.js 1.6.16 完整序列通过，1.7.1 出现无报错的时间/画面错位；去掉片尾跳转或取消钳制后 1.7.1 通过。证据位于 `test-results/media-compat/jellyfin-boundary-summary.md` 及对应 JSON。该结果缩小了问题范围，不证明完整 Jellyfin、真实长片或正式 Marchen v2 已通过，亦未定位 HLS.js 内部具体缺陷。
