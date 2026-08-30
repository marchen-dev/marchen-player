## 1. 建立兼容性基线与回归样本

- [x] 1.1 补齐当前 Electron / Web 直播放、影视库恢复、播放列表、字幕和截图链路的回归测试，记录现有行为边界
- [x] 1.2 将样本矩阵拆为小型单元样本与 30–60 秒结构样本，补齐缺失 HEVC codec string、未标记 Main10 SDR + FLAC、HDR10 + EAC-3、长 GOP、VFR/非零 start time、多音轨/attached picture，以及含空格和非 ASCII 字符的路径
- [x] 1.3 将共享类型调整为 InputFacts、CapabilityFacts、固定 OutputProfile、分阶段会话状态和带执行阶段的结构化错误，避免主进程和渲染进程重复或可选字段任意组合
- [x] 1.4 为过渡期建立传输回归基线：native 继续走内部协议，兼容 OutputProfile 走 Gateway，业务层只能观察统一 lease

## 2. 引入可审计的 FFmpeg 运行时

- [x] 2.1 新增 macOS x64/arm64 与 Windows x64 运行时清单，固定 FFmpeg 版本、对应源码、下载地址、SHA-256、构建配置和能力声明，明确 Linux 不在支持矩阵
- [x] 2.2 新增下载与校验脚本，将 FFmpeg / ffprobe 放入明确的资源目录，并在校验失败时终止构建
- [x] 2.3 调整 Electron 打包配置，通过 extraResources 按目标平台与架构携带二进制，同时避免将其他平台产物打入安装包
- [x] 2.4 实现生产包与开发环境统一的二进制定位、自检和能力探测，缺失或不可执行时返回可降级错误
- [x] 2.5 实现不经过 shell 的 FFmpeg 子进程执行器，支持取消、超时、有限 stderr、独立进度、关闭 stdin 以及先优雅后强制的清理
- [x] 2.6 为执行器增加本地输入协议白名单、探测时限、输出规模限制和结构化错误，验证损坏媒体不会无限阻塞或增长日志
- [x] 2.7 实现 FFmpeg 任务调度器，限制重型任务并发并让前台兼容播放优先于截图、缩略图和字幕转换
- [x] 2.8 将现有 ffprobe、截图和字幕提取迁移到新执行器与调度器，验证参数转义、错误映射与进程回收
- [x] 2.9 实现会话缓存预算、磁盘空间下限和只针对带标记孤立目录的启动 TTL 清扫
- [x] 2.10 删除旧安装脚本、fluent-ffmpeg 适配和不再使用的依赖及类型声明

## 3. 建立耐久媒体源与播放源租约

- [x] 3.1 引入 DurableMediaSource，Electron 持久化原始文件路径，Web 仅在内存中持有 File / Blob，不持久化临时 URL
- [x] 3.2 将 SourceLifecyclePort 改为唯一的异步播放源准备入口，使 Electron 与 Web 都通过同一生命周期接入播放器，并禁止组件自行拼接传输 URL
- [x] 3.3 实现 PlaybackSourceLease，并让 PlayerRuntime 成为租约的唯一所有者，统一处理替换、卸载和销毁释放
- [x] 3.4 为快速切集和异步竞态增加 generation 防护，过期结果必须立即释放且不得覆盖当前媒体
- [x] 3.5 让 direct lease 在第一阶段封装内部协议 URL、兼容 lease 封装 Gateway/HLS 会话，调用方不得分支判断底层传输
- [x] 3.6 调整 IPC 契约，只传递耐久媒体标识、会话标识和网关 URL，不在渲染进程暴露临时文件管理细节

## 4. 保护影视库与逻辑时间线

- [x] 4.1 将 Dexie 数据库升级到 v5，把可恢复的历史 marchen:// 媒体地址迁移为原始路径，并为无法恢复的记录保留可诊断状态
- [x] 4.2 统一影视库、播放列表和自动连播的稳定身份为 fileHash 与原始路径，禁止持久化 Blob URL、网关 URL、HLS URL 或临时目录
- [x] 4.3 调整字幕目录、截图和缩略图调用方，使其始终从耐久媒体源解析真实文件，而非复用当前 video.src
- [x] 4.4 将最近播放写入收口到媒体实际可播放/播放信号；状态机重构后该信号必须对应 browser `playable` / `playing`，探测、计划、Producer 成功或转码启动失败不得污染最近播放
- [x] 4.5 在 playback-core 和历史进度中引入逻辑时间映射，转码重启后仍按原视频时长与时间轴保存和恢复进度
- [x] 4.6 将协议 URL 限定为过渡期 lease 数据，增加数据库断言和迁移测试，禁止内部协议、localhost、token 与分片路径进入 HISTORY

## 5. 分阶段实现本机媒体网关

- [x] 5.1 实现只监听 loopback 随机端口的 Media Gateway，并在应用启动、窗口关闭和应用退出时可靠创建与关闭
- [x] 5.2 实现不可猜测的会话令牌、严格 Origin/CORS、路由和资源注册表，拒绝任意路径、目录穿越、未知客户端与跨会话读取
- [x] 5.3 实现 HLS 清单、init 与分片路由，设置正确 MIME/缓存策略，并只提供已原子发布的完整资源
- [x] 5.4 接入创建、查询、seek generation 和释放兼容会话的 IPC，第一阶段不改变普通 direct 的默认传输
- [x] 5.5 在兼容流稳定后实现 Gateway 原文件 200/206 Range 路由，覆盖 HEAD、start-end、start-、suffix、416、背压和客户端中断
- [x] 5.6 为 Gateway direct 增加非默认切换与内部协议回退，验证失败时不得破坏现有普通直放
- [ ] 5.7 完成开发态和 macOS/Windows 打包态 direct 回归后再将 Gateway 设为默认传输，并保留到协议删除门禁前的回退能力

## 6. 实现探测、能力判断与播放计划

- [x] 6.1 在主进程生成不做能力推断的 InputFacts，覆盖容器、时间线、视频/音频/字幕、位深与独立色彩事实；ffprobe 缺少 `mime_codec_string` 时通过确定性映射或目标输出探测补齐，不能静默跳过能力判断
- [x] 6.2 实现确定性的主视频/主音频选流，排除封面并按默认标记、语言和稳定顺序选择，所有 FFmpeg 预设使用显式 map
- [x] 6.3 在渲染进程根据目标容器的完整 RFC 6381 codec string 查询 MediaCapabilities/canPlayType，区分 supported、smooth、powerEfficient 与 unknown，并禁止把缺失 codec 事实当作支持
- [x] 6.4 将纯函数 PlaybackPlan 收敛为 `native`、`copy-video-aac`、`safe-h264-aac-sdr`、`hdr-to-sdr-h264-aac` 固定 OutputProfile，并为每个输出契约补齐单元测试
- [x] 6.5 实现 HEVC 原生优先策略：supported 为 true 时不论 smooth 结果均优先直放，powerEfficient 只作参考，unknown 时先直放，仅 unsupported 或实际解码失败才转 H.264
- [x] 6.6 实现 AAC-LC 48 kHz 输出策略：保持单/双声道，超过双声道下混立体声，视频可复制时不得因音频重编码视频
- [x] 6.7 分离 10-bit SDR 与 HDR 判断：高位深本身不得触发 tone-map，只有明确 HDR10/HLG 色彩事实才选择 HDR→SDR；色彩事实不足时不得猜测转换路径
- [x] 6.8 限定可触发一次性回退的媒体错误，并在 source 替换时恢复播放、旋转、字幕和弹幕状态；网络、权限、文件缺失和用户取消不得误触发
- [x] 6.9 增加仅开发构建生效的 `VITE_FORCE_TRANSCODE_PROFILE=audio|safe|hdr-sdr`，将旧 `VITE_FORCE_VIDEO_TRANSCODE=1` 暂时映射到 `safe`，确保强制测试输出确定且不影响 Web 与生产构建
- [x] 6.10 实现 `copy-video-aac` 的启动期限及到 `safe-h264-aac-sdr` 的单次受控升级，记录档位尝试链并禁止循环回退

## 7. 实现转码会话与渐进播放

- [x] 7.1 重构转码会话状态机，明确 planning、encoder-check、producing、producer-ready、attaching、playable、failed、released，并保证状态只能由对应证据推进
- [x] 7.2 实现作为 Pipeline Compiler 内部操作的 remux 预设，可复制兼容音视频并输出 fMP4 HLS；planner 不再将 remux 暴露为独立 OutputProfile
- [x] 7.3 将音频兼容预设收敛为 `copy-video-aac`，只有目标 fMP4/MSE codec 事实完整时复制视频，并按既定 AAC/声道策略统一转音频
- [x] 7.4 将视频兼容预设收敛为确定性的 `safe-h264-aac-sdr`，输出 H.264 8-bit 4:2:0 + AAC-LC；用 lavfi 合成帧做编码器自检，再以真实文件做独立 pipeline preflight
- [x] 7.5 将 tone mapping 限定到 `hdr-to-sdr-h264-aac`，为明确 HDR10/HLG 接入受验证的转换；10-bit SDR 仅转换像素格式，保留旋转、SAR/DAR 和正确色彩元数据
- [x] 7.6 实现 Producer Validator：检查原子发布、manifest/init/首段结构、codec、时间戳和关键帧边界；编码档位使用与分片匹配的 closed GOP，不再以约 2 秒文件存在作为唯一 ready 条件
- [x] 7.7 扩展 HLS/MSE 客户端适配层，在 SourceBuffer、`loadedmetadata`、有效 duration 与首个解码帧确认后才进入 `playable`，并按 manifest/MSE/metadata/decode 阶段上报错误
- [x] 7.8 记录原始 start time、请求 seek 和实际首个输出 PTS，为非零时间戳、B 帧和 VFR 建立 calibrated generation offset
- [x] 7.9 实现 seek generation：跳转时取消旧进程并从目标附近重新生成，同时维持原始时长、逻辑 currentTime、ended 和历史进度语义
- [x] 7.10 在一次性回退与 generation 切换中恢复暂停状态、音量、倍速、旋转、字幕选择/偏移和弹幕时钟
- [x] 7.11 处理系统睡眠/唤醒、网络盘中断和播放期间源文件变化，无法恢复时释放旧 generation 并允许从逻辑时间重试
- [x] 7.12 覆盖快速切集、窗口关闭、渲染进程崩溃、应用退出和下次启动的进程、端口、临时目录、Worker 与对象 URL 清理
- [x] 7.13 打通 Producer 与 Browser 两阶段确认、约 8 秒优化档位期限、generation 取消升级和跨 IPC 结构化错误，失败时保留退出码与有界 stderr 摘要

## 8. 按门禁下线 marchen://

- [x] 8.1 先移除 setAsDefaultProtocolClient 外部深链注册，保留过渡期内部 protocol.handle，并验证文件关联、open-file 与 second-instance 不受影响
- [x] 8.2 将所有 marchen:// 拼接收口到 SourceLifecyclePort 的 direct 过渡适配器，业务组件、HISTORY、字幕、截图和播放列表只使用耐久来源
- [ ] 8.3 在 Gateway direct 默认切换后执行完整回归；任一打包态 Range、seek、影视库或文件打开失败都必须恢复内部协议回退
- [ ] 8.4 仅在 Gateway direct 门禁全部通过后移除 path-bearing protocol.handle、路径解析、特权协议注册、bypassCSP 和相关共享常量
- [x] 8.5 更新播放器能力状态和设置展示：仅在运行时、Gateway 与会话均可用时声明转码可用，Web 端明确降级为原生播放

## 9. 集成验证与发布前检查

- [x] 9.1 运行 typecheck、相关单元测试及 Electron / Web 构建，修复新增类型、双端隔离和打包问题
- [x] 9.2 验证四个固定 OutputProfile：H.264/AAC 直放不启动 FFmpeg；HEVC supported 不因 smooth/powerEfficient 转码；音频不兼容选择 `copy-video-aac`；unsupported/实际 decode 失败选择安全档位；三个开发态强制档位输出确定
- [x] 9.3 用 30–60 秒结构样本验证多音轨、5.1 下混、缺失 codec string、Main10 SDR 不 tone-map、HDR10/HLG tone mapping、长 GOP、VFR/非零 start time、旋转与宽高比
- [x] 9.4 增加 Electron 首帧 E2E：断言计划档位、manifest/init/segment、SourceBuffer、`loadedmetadata`、duration > 0、首个解码帧、currentTime 推进、seek 后继续播放，并回归 ended、历史、自动连播、字幕、弹幕和截图
- [x] 9.5 验证特殊路径、损坏文件、未授权协议、FFmpeg 缺失、编码器自检失败、真实 pipeline 失败、滤镜失败、磁盘不足、优化档位超时升级、快速切集、睡眠恢复和异常退出均可分阶段诊断且可清理
- [x] 9.6 验证网关只绑定 loopback、CORS/Origin 受限、令牌不可跨会话复用、任意路径无法读取，Range 与 HLS 路由无目录穿越或半成品读取
- [ ] 9.7 分别检查 macOS x64/arm64、Windows x64 打包产物，核对二进制版本、源码对应关系、校验和、构建信息、可执行权限、签名和安装后自检结果
- [ ] 9.8 验证 Gateway direct 默认切换前后行为一致且回退有效，全部门禁通过后再确认内部协议代码可删除
- [x] 9.9 增加不提交媒体内容的本地真实文件 smoke gate，以可配置路径验证“HEVC Main10 HDR + EAC-3”和“未标记 HEVC Main10 SDR + FLAC”两个 MKV 在 Electron 中完成首帧、时间推进与 seek
