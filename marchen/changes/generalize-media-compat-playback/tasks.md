> 2026-09-06：播放用 FFmpeg/HLS 交付路线由 [双端播放内核重建](../rebuild-cross-platform-player-engine/proposal.md) 替代。旧实验和勾选状态保留，不代表新路线验收通过；仍被使用的辅助媒体/文件能力按新方案迁移后清理。本记录不执行归档。

## 执行说明

2026-09-05 规划修订：第 1–10 组保留此前记录的模块实现与实验成果，不代表修订后的应用 v2 路径已经交付，也不重新背书未复核的历史测试。新工作按第 11–16 组顺序执行；模块、独立 spike、真实应用入口、真实长片与打包态证据分别记录。

原 11.1–11.5 移至 16.1–16.5 并重新打开，以实际执行 v2 的应用路径验收；历史证据仍保留。原 11.6 的安全模块验证保留，新接入的异常/安全行为仍在 16.5 与最终检查中复验。原 11.7–11.11 移至 16.7–16.11，继续待完成。新约束在第 11–15 组显式列出，旧勾选不能抵消这些任务。

默认切换前完成 16.1–16.7、16.10 和 16.11 的切换前检查，再执行 16.8；16.9 需等待显式旧 transport 回退保留满一个版本周期，并在清理后完成 16.11 的影响范围复验。

## 1. 建立真实基线与关键技术 Spike

- [x] 1.1 固定当前 `add-ffmpeg-compat-playback` 的 Direct Play、`copy-video-aac`、全视频转码、首帧、seek、缓存与清理行为测试，记录新旧实现对比基线
- [x] 1.2 为本地 smoke 配置增加 HEVC Main10 HDR + EAC-3、HEVC Main10 SDR + FLAC、AV1、VP9、VC-1、MPEG-2、长 GOP、VFR/非零 start time 样本槽位，缺失时明确跳过且不提交媒体
- [x] 1.3 用用户长 MKV 对比 Matroska metadata 与 `ffprobe -skip_frame nokey` 关键帧提取耗时、内存、关键帧数量和 duration 准确性，保存原始指标
- [x] 1.4 用 MP4/长 GOP/VFR 样本验证 ffprobe 关键帧 PTS、segment 目标边界和尾段时长，确认不可用/超时降级条件
- [x] 1.5 分别测 CPU decode + VideoToolbox encode、CPU decode + libx264、可用硬件 decode + 硬件 encode 的首帧、处理倍速、CPU 和 seek，明确 macOS 初始候选顺序
- [x] 1.6 比较 `aac_at` 与 bundled `aac` 在 EAC-3/FLAC、单声道/立体声/5.1 下混上的初始化、速度、同步和输出契约，确定有序回退
- [x] 1.7 验证同一 pipeline 从不同 segment 重启产生的 fMP4 init codec、sample entry、track id、timescale 和 extradata 是否稳定，定义 fingerprint
- [x] 1.8 构造最小动态 VOD m3u8 + 延迟 segment server，验证 HLS.js 对缺失分片等待、seek 请求、segment 重试、稳定入口和 FFmpeg 重启窗口的行为
- [x] 1.9 根据 spike 结果冻结关键帧准备期限、首帧/seek 验收期限、segment duration、ahead window 与空闲停止阈值，并把原始数据保留在不含媒体内容的 test-results

## 2. 重构共享媒体契约

- [x] 2.1 新增源指纹与版本化 InputMediaFacts，包含 size/mtime、主轨道、完整容器/视频/音频/字幕事实，保持与 UI 能力推断无关
- [x] 2.2 定义 Direct Play 与 fMP4 HLS 分离的 ClientPlaybackProfile，以及视频、视频内音频、容器和字幕条件类型
- [x] 2.3 定义容器、视频、音频、字幕正交动作和 `direct-play | direct-stream | transcode` PlaybackDecision，禁止可选字段形成无效组合
- [x] 2.4 扩展 CompatibilityReason，覆盖容器、视频 codec/Profile/Level/位深/动态范围/帧率、音频 codec/声道/采样率、字幕与 runtime 能力原因
- [x] 2.5 定义 decoder/encoder mode、实际 runtime choice、pipeline fingerprint、init fingerprint 与结构化开发态 override
- [x] 2.6 定义 HLS timeline、segment descriptor、SegmentStore snapshot、PlaybackJob snapshot、生产/消费位置与活动请求状态
- [x] 2.7 调整 IPC/lease/session/telemetry 类型承载新决策与 Job 状态，同时保留旧 OutputProfile adapter 的迁移边界
- [x] 2.8 为共享 discriminated union、序列化、错误脱敏和非法组合增加单元测试

## 3. 完整 FFmpeg Runtime 与媒体事实

- [x] 3.1 将 runtime 自检解析为完整实际 decoder、encoder、filter、demuxer、muxer、protocol 与 hwaccel 集合，同时继续校验发布清单的最低必要能力
- [x] 3.2 建立 ffprobe codecName、别名与 decoder candidates 的确定性映射，覆盖 H.264、HEVC、AV1、VP8/VP9、VC-1、MPEG-2 与常见音频
- [x] 3.3 扩展 RFC 6381 映射到 AV1、VP8/VP9 及可可靠表达的音频，无法可靠映射时保持 unknown
- [x] 3.4 实现有界 target init probe，为 copy candidate 提取实际 sample entry/codec string，并限制输入、时长、输出与 stderr
- [x] 3.5 实现按规范路径、size、mtime 与 schema version 缓存 probe 结果，源文件变化时失效
- [x] 3.6 实现独立的 target probe/preflight 结果缓存，key 中包含主轨道和 pipeline target，失败结果只在安全短 TTL 内复用
- [x] 3.7 为 runtime catalog、codec alias、RFC 6381、target probe 与缓存失效补齐合成和真实 FFmpeg 测试

## 4. 构建 ClientPlaybackProfile

- [x] 4.1 将现有单文件能力查询拆为可复用的容器、视频、视频内音频与 fMP4 HLS capability probes
- [x] 4.2 为每个 capability 保留 supported、smooth、powerEfficient、source 与 unknown，确保 smooth/powerEfficient 不改写 supported
- [x] 4.3 基于 ffprobe/target probe 的完整 codec string 查询当前文件的 Profile、Level、位深、动态范围、分辨率、帧率、声道与采样率条件
- [x] 4.4 生成 Electron ClientPlaybackProfile，并按 Electron/Chromium 版本、平台与进程生命周期缓存稳定部分
- [x] 4.5 生成 Web 降级 Profile，明确 localCompatibilityAvailable=false 且不调用本地 FFmpeg/Gateway IPC
- [x] 4.6 对能力 API 抛错、canPlayType 空结果、MKV 容器不支持但 fMP4 轨道支持、HEVC/AV1/VP9 与音频组合增加测试
- [x] 4.7 增加开发诊断快照，允许查看 Profile 但隐藏路径、token 和环境敏感值

## 5. 实现通用兼容协商

- [x] 5.1 实现纯 CompatibilityNegotiator，对 InputMediaFacts、ClientPlaybackProfile、FfmpegRuntimeCapabilities 与可选 override 生成 PlaybackDecision
- [x] 5.2 实现 Direct Play 全条件匹配，容器、选中视频、选中音频和字幕均满足时不得启动 FFmpeg
- [x] 5.3 实现 Direct Stream 匹配，分别覆盖纯 remux、视频 copy + 音频 AAC，以及兼容音频 copy
- [x] 5.4 实现通用视频 Transcode 匹配，输入 codec 不受支持但对应 decoder 与 H.264 输出能力可用时选择视频转码
- [x] 5.5 实现视频转码时音频独立 copy/transcode，避免兼容 AAC/Opus 等轨道被无条件重编码
- [x] 5.6 实现 unknown Direct Play trial、明确 supported=false 转码和 smooth/powerEfficient 仅诊断规则
- [x] 5.7 实现 decoder/encoder/filter 缺失、Dolby Vision 不可靠、HDR tone-map 不可用等规划阶段结构化失败
- [x] 5.8 实现 profile 匹配优先级和 reason 聚合，保证多个失败原因稳定排序且可展示
- [x] 5.9 用表驱动测试覆盖 H.264、HEVC、AV1、VP9、VC-1、MPEG-2 与 AAC/EAC-3/FLAC/Opus 的 direct/copy/transcode 组合
- [x] 5.10 建立新旧 planner shadow comparison，仅记录决策差异；默认播放仍可通过 feature flag 回退旧 planner

## 6. 编译正交 FFmpeg Pipeline

- [x] 6.1 将 PipelineCompiler 输入切换为 PlaybackDecision，生成 remux、audio-compatible、video-compatible 与 HDR-compatible 四类内部操作
- [x] 6.2 为所有操作使用显式主视频/主音频 map，并验证无音频、单音轨、多音轨和 attached picture
- [x] 6.3 实现 video copy + audio copy 与 video copy + audio AAC，保留 HEVC hvc1/extradata 等按输入 codec 需要的 bitstream filter
- [x] 6.4 实现任意可解码输入视频到 H.264 8-bit 4:2:0，音频根据决策 copy 或 AAC，不按输入 codec 扩增输出 profile
- [x] 6.5 实现 decoder mode 选择和真实输入初始化：software 禁止 hwaccel，hardware 失败不静默回退，auto 失败后回退软件
- [x] 6.6 实现 macOS/Windows 已验证硬件 decoder 候选；未通过真实样本的候选不得加入 auto 顺序
- [x] 6.7 保留硬件 H.264 encoder 初始化与 libx264 回退，并把 encoder 选择纳入 pipeline fingerprint
- [x] 6.8 实现 `aac_at` → bundled AAC 的初始化与回退，把实际 encoder、声道、采样率和码率写入 Job snapshot
- [x] 6.9 将 HDR10/HLG tone-map、10-bit SDR 像素转换、旋转、SAR/DAR 与色彩元数据处理迁移到新 decision，并为 Dolby Vision 返回安全边界
- [x] 6.10 用合成帧与真实输入执行有界 preflight，分别验证 decoder、encoder、滤镜、音频、选流、时间戳与 fMP4 封装
- [x] 6.11 为正交动作、软件/硬件模式、AAC 回退、HDR/SDR 和输入 codec 矩阵补齐参数与真实输出测试

## 7. 建立关键帧与 VOD 时间线

- [x] 7.1 定义源时间、逻辑时间、segment index、计划起止、实际首 PTS 与尾段的统一 HLS timeline contract
- [x] 7.2 实现可取消的 Matroska metadata 关键帧提取，处理 cues 缺失、损坏、非零 start time 和 duration 偏差
- [x] 7.3 实现受调度器限制的 ffprobe keyframe 提取后备，设置时限、输出上限、低优先级和取消清理
- [x] 7.4 实现按源指纹/version 持久化关键帧元数据，写入原子化、损坏可降级且不缓存媒体内容
- [x] 7.5 实现视频 copy 的关键帧 segment 聚合算法，覆盖长/短 GOP、尾段、duration overshoot 与无零时刻关键帧
- [x] 7.6 实现视频转码的等长 VOD timeline，并让 closed GOP/force keyframe 与 timeline 使用同一 segment duration
- [x] 7.7 实现关键帧不可获得或超时的明确策略，禁止生成声称独立但未对齐关键帧的清单
- [x] 7.8 为关键帧、VFR、非零时间线、长 GOP、尾段和缓存失效增加单元与真实样本测试

## 8. 实现稳定 Dynamic HLS Session

- [x] 8.1 新增 v2 兼容会话路由与稳定 token URL，保留 v1 generation transport 作为 feature flag 回退
- [x] 8.2 根据 HlsTimeline 动态生成 VOD manifest，稳定暴露 init 与逻辑 segment endpoint，并保持正确 MIME/no-cache/immutable 策略
- [x] 8.3 实现 SegmentStore，管理 segment index、工作资源、已验证资源、waiter、消费位置和原子发布
- [x] 8.4 改造 Publisher，把 FFmpeg 内部 manifest/segment 提升为逻辑 SegmentStore 资源，继续拒绝临时文件、符号链接和未验证输出
- [x] 8.5 实现 init fingerprint 校验，覆盖 codec、sample entry、track id、timescale 与 extradata；Job 重启不兼容时禁止混用
- [x] 8.6 实现 segment GET 请求：已发布直接返回、生产中等待、缺失时请求 Playback Job，并正确处理客户端取消与背压
- [x] 8.7 实现 session 级异步锁与活动响应保护，反向/远距离请求替换 Job 前等待安全点且禁止双写同一路径
- [x] 8.8 实现从目标 segment 附近启动 FFmpeg、设置起始编号、校准实际首 PTS，并验证产出覆盖请求目标
- [x] 8.9 建立 stable-vod lease 不挂载 generation seek 的模块分支与独立浏览器可行性证据；真实应用接入见 14.1–14.3
- [x] 8.10 覆盖 init 请求、顺序播放、短前跳、远距离前跳、反向 seek、重复请求、并发请求和 404/超时的 Gateway 集成测试

## 9. 实现 Playback Job 生命周期与缓存窗口

- [x] 9.1 实现 PlaybackJobManager 与 idle/starting/producing/throttled/stopping/stopped/failed 状态机，状态只由对应进程和资源证据推进
- [x] 9.2 为 Job 记录 session、pipeline fingerprint、覆盖 segment 范围、requested start、实际首 PTS、decoder/encoder 和有界 stderr
- [x] 9.3 实现原子 activeRequestCount、segment waiter 和 heartbeat，活动响应期间不得删除资源或替换写入者
- [x] 9.4 建立空闲停止控制器与 executor 的 stdin/强制终止接口；真实参数一致性和客户端活动语义见 12.2、15.2
- [x] 9.5 建立 progress/HLS 请求指标计算模块；真实接入与位置语义修正见 15.2–15.3
- [x] 9.6 建立 ahead 控制器与 pause/resume、stop/restart 接口；当前需求恢复点和默认启用验收见 15.1–15.3
- [x] 9.7 建立关闭旧分片删除时的预算/磁盘模块检查；真实生产有界性见 15.3
- [x] 9.8 建立受再生门禁和引用计数保护的 back window 清理模块；实际启用见 15.4
- [x] 9.9 建立源变化、睡眠/唤醒、切集、崩溃、关闭和退出的生命周期取消模块；真实事件接入见 13.4、16.5
- [x] 9.10 将 probe/keyframe metadata cache 与 segment session cache 分离，启动清扫只处理带有效 marker/version 的归属资源
- [x] 9.11 为 Job 替换、空闲超时、ahead 节流、预算不足、磁盘不足、分片回收和异常退出增加确定性测试

## 10. 回退、播放状态与诊断 UI

- [x] 10.1 建立 logical Direct Play trial → Direct Stream → Full Transcode 单向状态模块；实际协商、回退接入见 14.1、14.4
- [x] 10.2 只允许浏览器 decode/src-not-supported、可归因 producer/MSE 不兼容触发回退；文件、权限、磁盘、网络盘和取消错误终止当前 attempt
- [x] 10.3 在 attempt 切换中恢复 logical currentTime、暂停、音量、倍速、旋转、字幕选择/偏移和弹幕时钟
- [x] 10.4 建立 profile/probe/keyframe/preflight/job/segment/MSE/first-frame 分阶段期限模块；真实 v2 接入见 14.4，旧规则删除见 16.9
- [x] 10.5 扩展播放信息展示 method、容器/视频/音频动作、输入/输出 codec、decoder/encoder class、HDR 处理、reasons 与 attempt chain
- [x] 10.6 增加开发态结构化 override，支持强制 Direct Stream、Full Transcode、software/hardware decoder 与 software/hardware encoder
- [x] 10.7 将旧 `VITE_FORCE_TRANSCODE_PROFILE`/`VITE_FORCE_VIDEO_TRANSCODE` 映射到新 override 后标记废弃，确保生产与 Web 忽略
- [x] 10.8 记录阶段耗时、首帧、seek、生产/消费/ahead、缓存和清理指标，并对 token、缓存路径与完整源路径做脱敏
- [x] 10.9 为回退分类、状态恢复、override 隔离、播放信息字段和日志脱敏增加单元/Electron 集成测试

## 11. 优先修复迁移期 seek 恢复

- [x] 11.1 修复 generation seek Promise 失败链；可恢复会话允许再次请求，失效 generation 明确重建或终止，并覆盖失败后再次拖动
- [x] 11.2 seek 失败和恢复期限到达时退出 seeking，保留暂停/音量/倍速意图，区分旧媒体可恢复与必须重新加载的状态
- [x] 11.3 合并未启动的过期 seek，以最新目标为准；覆盖 A→B→C 连续拖动、旧结果迟到和切集期间 seek，避免无效 generation 排队

## 12. 校准目标能力、正式 compiler 与分片身份

- [x] 12.1 分离 file/MSE 的视频和音频证据，补齐目标输出组合门禁；覆盖 file 音频支持而 MSE 不支持，以及直放不等待多余 target probe
- [x] 12.2 正式动态 compiler 承接 spike 的 avoid_negative_ts/frag_discont/skip_sidx 与时间戳策略；统一 gracefulStdin 和 nostdin，验证真实停止与超时终止
- [x] 12.3 保留 HLS muxer，按累计目标切点生成清单；用正式 compiler 验证从零/中间/尾段启动的实际范围，明确可接受边界变化的管线与客户端条件；不照搬片尾减五秒或固定偏移，覆盖不规则关键帧、长 GOP、VFR、非零 start time 与最短尾段
- [x] 12.4 Publisher 核对 EXTINF、实际音视频覆盖、尾段和 init fingerprint；将数值容差与已验证边界变化分开记录，拒绝未验证变化、内容错位或不可恢复缺口，不覆盖已发布资源或修改已交付 VOD 清单
- [x] 12.5 浏览器测试复用正式 compiler/publisher/router，覆盖从中间连续播放跨片段、片尾→片头及同编号再生与缓存衔接；验证目标可达、画面时间对应、音视频连续和 init 兼容，记录版本及帧级误差，历史 spike 不改写

## 13. 完成 Job 所有权、替换与取消

- [x] 13.1 将 producing 与发布操作关联 jobId/epoch，拒绝已替换 Job 的迟到回调，保留已验证资源的稳定身份
- [x] 13.2 Job 替换/停止/失败时结束全部所属未完成生产状态；有效需求重调度，相关 waiter 得到结果或结构化失败，不永久停在 producing
- [x] 13.3 覆盖远跳后回跳、重复并发请求、单请求取消、生产失败后重试与响应中替换；验证引用释放和单写入者约束
- [x] 13.4 将生命周期模块接入真实 source switch、release、窗口关闭、Renderer 崩溃与睡眠事件；取消后禁止新生产，唤醒 waiter 并验证无孤儿进程

## 14. 从真实应用入口接通 v2

- [x] 14.1 在开发开关下接通 generalized → decision → 正式 session factory/compiler → coordinator/router → stable-vod lease；记录 configured/executed planner 与实际 transport，shadow 只比较
- [x] 14.2 首条路径使用 HEVC copy + EAC-3→AAC，从真实应用打开文件验证首帧与进度；禁止同时启用旧分片删除或未经验证硬件优化
- [x] 14.3 同一 URL/lease 下验证短前跳、远跳、反向、片尾→片头与连续 seek，结合分片请求、currentTime、画面内容时间及音视频连续性取证，普通 seek 不走 generation 换源
- [x] 14.4 接通分阶段期限和有界 fallback，保证 seek 5 秒恢复期限与 segment 10 秒 waiter 的取消关系；错误退出 seeking，非兼容错误不升级转码
- [x] 14.5 扩展软件视频转码基线及音频独立 copy/AAC，覆盖实际输出与 HDR 边界；旧 transport 回退必须显式记录原因，不能伪装 v2 成功

## 15. 接入资源控制并优化性能

- [x] 15.1 在正式 v2 路径验证真实 stop/restart 的跨 Job 音画连续性；识别主动停止与异常失败，不发布未完成分片
- [x] 15.2 分离客户端活动时间、FFmpeg progress、下载位置、播放器位置及连续发布窗口；验证无客户端但仍有 progress 时空闲停止，乱序预取不推进回看位置
- [x] 15.3 启用 20/60/90 秒 ahead 门槛，从当前有效需求附近的连续窗口恢复；覆盖中间起播、远端稀疏分片、暂停/恢复、预算及磁盘不足
- [x] 15.4 真实反向分片再生与活动响应保护通过后才启用 120 秒 back window；验证删除后的回看、并发读取和清理失败
- [ ] 15.5 在正确性基线通过后优化 probe/target probe/preflight 缓存和已验证硬件候选，记录冷暖首帧、seek、CPU 与处理速度；缺平台明确未验证

## 16. 真实应用回归、默认切换与旧实现清理

- [ ] 16.1 [真实应用 v2 重新验收] 在 feature flag 下运行新旧 planner shadow comparison 与 v1/v2 HLS A/B，核对行为差异、首帧、seek、CPU 与缓存
- [ ] 16.2 [真实应用 v2 重新验收] 用真实样本验证所有计划路径：Direct Play、remux、只转音频、只转视频、音视频都转、HDR tone-map 与 terminal unsupported
- [x] 16.3 [真实应用 v2 重新验收] 增加 Electron E2E，断言稳定 HLS URL、manifest timeline、目标 segment 请求、首帧、画面与媒体时间对应、音视频连续及多次前后/片尾 seek；记录 FFmpeg/HLS.js 版本，无报错或进度推进不能单独通过
- [ ] 16.4 [真实应用 v2 重新验收] 回归影视库续播、HISTORY、已看阈值、播放列表、自动下一集、截图、缩略图、内嵌/外置字幕和弹幕同步
- [ ] 16.5 [真实应用 v2 重新验收] 回归特殊路径、损坏媒体、缺少 decoder/encoder/filter、FFmpeg 异常退出、磁盘不足和源文件变化的错误与清理
- [x] 16.6 保留已有 Gateway 安全模块/集成验证：验证 Gateway 仍只绑定 loopback、token 不可跨 session、动态 segment 路由无目录穿越、半成品或跨源读取
- [ ] 16.7 验证 macOS arm64/x64 与 Windows x64 开发/打包态 runtime catalog、软件 decoder、硬件候选、AAC 与 Dynamic HLS
- [ ] 16.8 达到首帧/seek/缓存门禁后将新 negotiator 与 v2 Dynamic HLS 设为默认，保留一个版本周期的显式旧 transport 回退
- [ ] 16.9 显式旧 transport 回退保留满一个版本周期后，删除其依赖的四个旧 OutputProfile、legacy plan adapter、generation seek/reload、固定 8 秒升级及不再使用的遥测字段/测试
- [x] 16.10 确认普通 Direct Play 仍可使用现有内部 Range lease，不启用旧 change 中未验收的 Gateway direct 默认化或内部协议删除
- [ ] 16.11 在切默认前完成检查并在旧实现清理后按影响范围复验：运行 typecheck、相关单元/集成/Electron E2E 与 Electron/Web 构建，输出不含媒体和敏感路径的验收证据

## 12.3 后续实施依据（2026-09-05）

首次实验确认不同起点重启会改变分片边界；后续对照表明这种变化不必然导致播放失败。因此不再以“必须换成固定切点生产方式”作为前置条件，保留 HLS muxer，按修订后的 12.3–12.5 验证正式管线。

独立合成实验中，Jellyfin 风格片尾钳制与 HLS.js 1.7.1 组合出现无报错的时间/画面错位；1.6.16 同序列通过，1.7.1 取消片尾钳制后通过，0.5 秒偏移未消除边界变化。该结果不是完整 Jellyfin 或正式 Marchen v2 验收，也未定位客户端内部具体缺陷。报告及原始 JSON：`test-results/media-compat/jellyfin-boundary-summary.md`；首次边界记录：`test-results/media-compat/dynamic-boundary-review.json`。

此前安排的 12.3–12.5 已按下方证据完成；合成样本证据不扩大为真实媒体通用策略。不更换 muxer、不降级依赖、不以整数秒实验的 1.5 秒采样阈值作为正式精度标准。

12.3 输出证据：`test-results/media-compat/formal-boundary-{irregular,long-gop,nonzero,vfr}.json`，正式 compiler 已验证开头/中间/末段的合成输出；非零起点与 VFR 样本使用显式 0.5 秒候选，默认不偏移。客户端允许边界变化的范围由 12.5 验证前默认不放行。

12.5 证据：`test-results/media-compat/formal-browser-boundary.json`。正式 compiler/Publisher/Gateway 在 HLS.js 1.7.1 下完成跨片连续播放、片尾→片头与同编号再生；画面使用 24fps 帧标记并检查 0.15 秒差值，音视频 packet 范围单独验证。允许变化仅在合成样本测试策略内，未扩展为生产 codec 白名单，真实应用接入仍见第 14 组。

## 14.3 实际应用阻塞（2026-09-05）

以下为修复前记录；本轮修复及复验见本文末尾，14.3 已解除阻塞。

13.4 已将真实窗口关闭、Renderer 崩溃、睡眠与 lease release 接入 controller/v2 lifecycle；永久 close 禁止排队与迟到 Job 重启。真实 FFmpeg 测试等待进程退出并确认 PID 不再存活。

14.1–14.2 在 Electron 开发入口完成 generalized → decision → 正式 factory/compiler → coordinator/router → stable-vod lease。`formal-app-v2-first-frame.json` 记录 HEVC Main10 + EAC-3 样本通过 v2 清单/init/分片请求，播放到 2.001 秒并解码 60 帧。该短片不证明跨 Job seek 成功；默认仍为旧链路，视频转码扩展未开放。

14.3 保持未完成。120 秒带 24fps 帧标记的 HEVC/EAC-3 样本远跳发生 500/504；已修复“退出 Job 仍按 coverage 复用”的状态错误，但重启媒体边界问题仍存在。`formal-hevc-restart-boundary.json` 显示 segment 16 计划 96–102 秒，默认输出视频为 89.917063–95.875 秒且该段无音频；显式 0.5 秒候选的视频为 95.917063–101.875 秒、音频从 96.478667 秒开始，不能通过音视频连续性检查。禁止把该候选直接推广到实际应用。

`formal-app-v2-seek.json` 保留普通 canvas 采样超出 0.15 秒阈值的原始结果；`formal-app-v2-seek-frame-callback.json` 保留逐帧回调复测及远跳失败请求。前者不单独证明媒体偏移，后者首个成功跳转的内容与 frame mediaTime 相符；完整序列尚未通过。下一步需针对真实 HEVC 重启同时校准视频切点、音频覆盖与 init/相邻分片约束，按已有设计继续拒绝未验证范围。

## 14.3 修复与 14.4 进展（2026-09-05）

- HEVC copy + EAC-3→AAC 的非首段使用已验证的 0.5 秒 demux 定位候选；`-noaccurate_seek` 保留音频预卷，`atrim` 按计划逻辑时间裁剪，保留原时间戳。视频与音频的范围、缺失音轨、init 和相邻片段校验继续生效。其他音频组合没有默认启用该策略；极短尾片明确回退。
- `formal-hevc-preroll-boundary.json` 覆盖第 1、16、19 片的实际音视频范围。第 16 片音频起点由 96.478667 秒修正到 95.978667 秒，与视频相差约 0.062 秒，前部/中间/尾部检查通过。
- `formal-app-v2-seek-preroll.json`：真实应用完成 8→100→8→117→1 秒及连续跳转到 12 秒，保持同一播放源，目标位置与逐帧内容检查通过，相关 v2 请求均为 200。测试增加逐帧回调期限并关闭测试匹配对话框；另保留延迟回调原始记录，不把后台采样延迟混作通过证据。
- `formal-app-v2-timeout.json`：在实际应用内使用正式 Runtime/HTMLVideo/HLS 模块并故意挂起 segment 16，请求约 5003ms 后退出 seeking，src 属性移除、readyState/networkState 均为 0。deadline 只由目标 seeked 撤销，旧缓冲 canplay 不能误取消；HLS destroy 会拒绝 attach 等待并防止销毁中的重入网络恢复。
- `formal-app-v2-fallback.json`：VFR 非零起点样本在准备阶段因输出时间线不合约而明确回到 v1 generation lease，保留原 decision/profile，只尝试一次；未把这条准备阶段证据算作完整播放验收。
- 14.4 的 seek deadline、取消及明确 transport 回退已实现。完整 profile/probe/preflight 等 IPC 准备阶段期限仍需继续接线，因此 14.4 暂不整体勾选。默认链路仍未切换。

- 本轮相关 Main 测试 122 项、Renderer 全量回归 241 项通过；随后追加的回退用例测试 8/8 通过，typecheck 与 diff 检查通过。开发热更新另观察到 `Cannot access App before initialization`，无热更新冷启动可正常显示播放器导入页；该 HMR 问题未计入本轮修复。

## 14.4–14.5 完成证据（2026-09-05）

- profile/probe/keyframe/preflight/job/首片准备期限接入 Main；Renderer 取消通过 requestId 中止准备，迟到结果也释放。真实 FFmpeg 取消测试确认 PID 退出；错误保留 deadlineStage，兼容性以外错误不升级。已有 seek 5 秒和 HTTP waiter 10 秒取消证据继续有效。
- v2 软件视频基线使用显式软件 decoder + libx264，音频独立 copy/AAC。中途起播的关键帧表达式保持编码相对时间；视频转码而音频 copy 时丢弃 seek 前音频包，避免上一 GOP 声音残留。
- 正式 factory 的 4 类真实 FFmpeg 输出测试通过：HEVC/AAC、HEVC/EAC-3、HDR10/EAC-3、HLG/AAC，长片额外检查 14 秒起播；输出 H.264/yuv420p，HDR 输出 bt709。Dolby Vision、未经验证的强制硬件/系统 AAC 明确拒绝；不可靠时长显式回退旧 transport。
- `formal-app-v2-software-seek.json`：Electron 实际入口完成 8→100→8→117→1 和连续跳转至 12 秒，同一 URL，逐帧内容与媒体时间误差小于 0.15 秒。弹幕匹配代理不可达，测试仅替代匹配 API 为无匹配，媒体管线真实执行。窗口隐藏导致 rVFC 超时的原始记录另存 hidden/focus-lost 文件，成功轮保持窗口可见，未放宽精度门槛。
- typecheck 通过；准备与会话控制 Main 8 项、Renderer deadline/runtime/fallback 23 项通过；软件输出/producer 校验/准备取消组合 10 项通过。默认仍为旧 planner/transport，资源控制与完整应用矩阵继续按第 15–16 组执行。

15.1 补充：`formal-software-stop-restart.json` 使用正式 factory/Publisher，实验仅对生产输入限速，确认停止前 PID 存活、停止后退出，再由缺片请求启动第二个 Job；旧 init/分片内容保持不变，新旧相邻分片实际音视频范围通过 Publisher 校验。主动停止不进入 failed，未完成输出不发布。HEVC copy 的替换衔接另由 14.3 实际应用序列覆盖。

## 15.2–15.4 资源控制接入（2026-09-05）

- 客户端播放位置由 Runtime 每 5 秒经 lease/IPC 报告；分片下载仅更新 downloadPosition，不推进回收位置。FFmpeg progress 单独记录 lastProgressAt，不能刷新空闲期限。乱序预取、远端稀疏分片、无客户端但持续 progress 的单元测试通过。
- 连续窗口从播放位置逐片检查，缺片即停止累计；不使用最远分片或 FFmpeg 编码进度代替可播放 ahead。无已验证进程 pause 时，60 秒使用 stop/restart 基线，90 秒走停止分支；20 秒以内从当前连续窗口末端恢复。
- `formal-software-ahead-resume.json`：真实正式管线在 62 秒 ahead 停止，播放位置报告为 47 秒后从 62 秒启动新 Job；主动取消按进程退出证据记 stopped，不伪装异常失败。预算/磁盘检查继续在启动及发布前调用 cache.reserve。
- `formal-app-v2-seek-e2e.json`：新增可执行 Electron E2E 脚本后，资源控制接入的冷启动实例完成全部 6 次逐帧跳转。与其他转码测试并发会争抢 CPU，使严格期限测试超时；完整 Main 检查使用单 worker，不放宽生产期限。
- 16.10 已核对 Direct Play 的默认 custom-protocol lease 和对应测试；Gateway direct 仍需单独显式开关。本次未启用 Gateway direct 默认化或删除内部协议。
- 15.4 的正式文件删除/反向再生记录见 `formal-software-back-regeneration.json`：活动引用保护、文件移除、反向重新产出及画面 10 秒标记通过。测试缩短 back window 到 20 秒以复用 120 秒样本，默认阈值保持 120 秒；开放范围限制在经过验证的软件 HEVC + EAC-3 非 tone-map 管线，其他管线继续保留分片。

- 15.4 完成：默认 120 秒回收已接到已验证的软件 HEVC/EAC-3 非 tone-map 管线；其他管线的门禁保持关闭。文件删除失败保留待重试路径，即使播放位置返回片头也继续重试；对应确定性测试和正式再生测试通过。

## 本轮检查结果（2026-09-05）

- Main 70 个测试文件：297 通过、1 跳过；Renderer 41 个测试文件：273 通过。新增 Runtime 心跳测试验证读取真实时钟、换源和销毁停止旧 lease 心跳，播放信息可序列化。
- typecheck、Electron 构建、Web 构建通过；本地构建禁用 Sentry 上传。Web 构建仍有体积提示，未宣称已经完成性能优化。
- 16.3 正式 E2E 冷启动通过：Electron 44.0.0 / Chromium 152.0.7977.54 / FFmpeg 9.0.1 / HLS.js 1.7.1。VOD 总时长 120 秒，目标 8/100/117/1/12 秒对应 4/50/58/0/6 号分片均实际请求成功，完整 6 次逐帧 seek 误差小于 0.15 秒。清单由 CDP 读取实际响应（含 base64 解码），不依赖手写预计清单。
- 软件 stop/restart、ahead 续产、活动读取保护和删除后反向再生均有正式管线报告；音视频实际范围由 Publisher 校验。未把这些合成样本扩大为所有真实影视文件或其他平台的验收。
- 尚待：15.5 性能/缓存和硬件验证；16.1–16.2 A/B 与完整媒体路径矩阵；16.4–16.5 产品功能和异常场景回归；16.7 跨平台开发/打包；默认切换和一个发布周期后的旧实现清理。16.11 已完成本机本轮检查部分，切默认/清理后的最终复验尚未完成。
