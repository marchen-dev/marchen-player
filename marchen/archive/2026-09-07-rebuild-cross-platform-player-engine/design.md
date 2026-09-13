## 背景

当前分支 feat/player-engine 与旧分支 feat/player-refactor 均起于 8ce47f2；工作在同一 checkout 开展，没有 worktree。旧分支保留原实现，切分支前须保证没有另一个任务继续修改此目录。本变更仅在新分支实施，不推送或归档旧分支。

既有 MediaPort、PlaybackSession、PlayerRuntime 与 DOM 弹幕时钟可复用，但 useNativePlayerRuntime、NativePlayer、字幕适配、source lease 和遥测混入了 HTMLVideoElement/HLS 假设。webPlayerCapabilities 将截图和内嵌字幕写死为 false，Web 字幕选择仅接受 ASS/SSA，必须改变这类平台静态限制。

MediaBunny 源码核对基线 c67c5e4（1.55.7）：具备数据源、轨道/附件读取、取帧、Canvas 池、WebCodecs 接入和官方音频 WASM 扩展；没有字幕轨读取和 HEVC WASM 成品。实施锁定实际依赖版本，不能把文档声明当作样片验证结果。

## 目标与非目标

**目标：**

- 建立 MediaBunny 优先的双端媒体层、原生/Canvas 两引擎以及统一播放业务。
- 支持本地 MP4/MKV、HEVC Main/Main 10、AC-3/E-AC-3/DTS 解码和常用浏览器音频格式；双端文本字幕、字体、截图、预览与用户选定列表。
- 将 Node 限于平台文件服务和仍有用途的辅助工具，通用兼容播放不依赖远端服务或 Node 视频解码。
- 删除已获授权的旧播放转码与 HLS 链，不留下第三条隐式回退。

**非目标：**

- 手机/平板、远程媒体服务器、多用户、直播 ABR、录制和视频编辑导出。
- 本次不交付图片字幕 PGS/VobSub、Dolby Vision 专用处理、Atmos/压缩音频直通；不保证所有设备完整 HDR 输出；双端 HDR10/HLG→SDR 正确性仍是交付条件。
- 不重新设计既有播放器视觉，不整体回退播放器/遥测，不承诺低配置机器流畅播放所有 4K 文件。

## 决策

### 1. MediaBunny 是媒体基础，Marchen 拥有播放策略

```text
Web File/授权句柄       Electron 授权文件读取
          \             /
        Source + 媒体身份/元数据
                  |
          Marchen 引擎选择器
             /          \
       原生 video      Canvas 引擎
                       MediaBunny
                       WebCodecs / 音频 WASM / HEVC 扩展
             \          /
        PlaybackSession + PlaybackClock
                  |
          控制器、字幕、弹幕、历史
```

MediaBunny 的输入读取、轨道查询、EncodedPacketSink、VideoSampleSink、AudioSampleSink/AudioBufferSink、CanvasSink、MetadataTags/AttachedFile 为优先复用边界。只有 HEVC WASM、字幕读取、时间伸缩及特定色彩处理等缺口允许额外实现或依赖。HEVC 已选定 @suemor/libav-hevc@0.1.1 发布包（libav.js decoder-hevc）；libmedia/hevc.js 仅保留为历史调研，不作为本次解码依赖或并行选型任务。其他缺口的依赖独立评估，不引入第二套完整播放器。对 HEVC 压缩包配置、显示顺序、生命周期等作适配，避免复制既有解封装逻辑。

提取共用媒体服务到 renderer services 下的独立模块；纯接口可放入 shared/playback-core，DOM/Worker 依赖不进入纯核心包。内部引擎名使用 native/canvas，解码 backend 单独记录，UI 不使用供应商名称作为功能名。

### 2. 先验证缺口，结果进入正式适配器

在删除生产链前完成最低可用链路；已有正确性证据直接复用，完整性能、线程矩阵和平台验证不作为继续开发的前置条件：

- HEVC：锁定 @suemor/libav-hevc@0.1.1 与包内 manifest，迁移时做一次相关接口和代表样片冒烟，复用已有 8/10-bit、Annex B/length-prefixed/extradata、B 帧顺序、flush/重置、颜色信息、内存增长与线程能力。实现 CustomVideoDecoder 的实验适配，随后由正式引擎复用。自定义 decoder 匹配优先于 WebCodecs，需通过能力探测/明确 backend 选择防止抢占硬解。
- 字幕：验证独立浏览器容器字幕提取组件，支持 MKV ASS/SSA CodecPrivate 样式头与 Block 时间/时长重建、UTF-8 文本、轨道语言/default/forced，检测图片字幕但不误当文本。复用共享按需读取，验证长片扫描、取消与内存；不把 MediaBunny 附件读取误当字幕轨读取。外部库应审查许可证、维护状况及打包成本，不做未经验证的库选型承诺。

结果必须包含可复现命令、依赖版本、实际路径与样片类别。若性能或适配不可行，停止后续依赖任务并修订此 design；不能直接改成 Node-only 或取消 Web 功能。正式开发不可用另一个实验 server/decoder 代替验收。

### 3. 双端来源与缓存

Web 使用 BlobSource(File)，可用的 File System Access 句柄只作为增强；Electron 使用受控 Range 读取或 CustomSource，复用库的预取/缓存，不一次 IPC 返回整个文件。既有自定义协议能被 video 读取不代表 fetch 可用，须验证权限、Range、特殊路径、取消和源文件变化。Source 的关闭只能由源 owner 发起，各消费者通过引用租约共享，字幕/缩略图释放不得关闭主播放。

初始预算作为可调基线：读取缓存每源 32 MiB、缩略图缓存 64 MiB、字体缓存每媒体 32 MiB；每类记录峰值并允许经实测修订。超预算取消过期后台任务或回退字体，不把限制实现成整部影片被预读。媒体身份沿用已有 hash 协议，文件大小/时间等用于读取缓存失效；不能仅靠临时 URL 关联历史。

Web 历史只保存稳定身份和偏好；文件句柄恢复失败则重新选择并核对身份。外挂字幕可在明确预算下保存内容，或要求重新选择；不持久化 blob URL。多文件列表由用户授权建立，Electron 同目录发现是独立增强。

### Electron 协议与页面来源重建

沿用官方 protocol.handle，移除旧 marchen://<磁盘路径> 解析和兼容分支。生产页面使用固定 marchen://app/index.html，打包静态资源仅允许受限资源目录；媒体使用 marchen://media/<随机租约标识>，标识映射由 Main 持有，只服务用户已授权媒体。旧协议字符串不再接受，也不将 URL 用作持久化身份。

scheme 按需声明 standard/secure/supportFetchAPI/stream 等权限，bypassCSP 保持 false；按用户决定，本次不设置 CSP meta 或 CSP 响应头，不维护 CSP 域名白名单。来源校验及必要 CORS/CORP 配置仍需实现。应用资源与用户媒体按 host 隔离，用户媒体不能作为应用脚本或 HTML 导航加载。资源目录解析防止目录穿越；媒体租约绑定拥有者生命周期，退出/切源后撤销，诊断不记录租约令牌。

生产入口从 loadFile 改为固定应用 URL；开发仍使用 Vite HMR，仅放行实际配置的开发来源。H5 和 MediaBunny UrlSource 共用媒体 Range 通道，验证 GET/HEAD、无 Range、合法单 Range、越界/后缀范围、206/416、取消和文件变化。优先评估 net.fetch(pathToFileURL(...)) 的流式文件响应，只有验证通过才复用，不假设它自动覆盖所有 Range 需求；不足处使用最小有界文件读取实现。无需旧 HTTP/HLS Gateway。Worker/WASM、相对资源、跨源隔离与打包态 IndexedDB 必须实际验证；secure 标志本身不等于 crossOriginIsolated。

参考：Electron 官方 protocol API 和 security 第 18 条，均推荐以 protocol.handle 提供受控自定义协议。

### 持久化模型细化

当前 MARCHEN_DB 为 Dexie v5，包含 history/library；marchen-telemetry 的 events 是独立事件队列。此次保留 library、弹幕和监控队列表结构，history 保留 hash、进度、时长、匹配及业务字段，补充判别来源与稳定音轨/字幕偏好。Electron 来源保存原始文件路径，Web 来源保存名称/大小等核对信息及可用授权句柄；句柄的存储位置按实际序列化和访问方式确定，不把授权永久有效作为前提。

字幕来源区分 embedded/external，内嵌轨道标识绑定媒体并在恢复时重新核对，禁止沿用 FFmpeg 流索引充当新解析器 ID。外挂来源保存可恢复定位或预算内内容，恢复失败要求重新选择。音轨同样保存可重新匹配的选择依据，找不到时使用明确默认值。全局 engine preference 放在现有 atomWithStorage 设置中；实际内核、decoder、播放租约与临时 URL 不持久化为媒体身份。

用户明确允许不兼容旧版本。此次不迁移旧协议路径、旧 history 结构或 HLS/job/cache 状态，删除 pathStatus/originalPath/pathMigrationError 及旧路径恢复分支。新版本使用新模型，保留 history/library/弹幕的业务功能，不承诺继承旧记录；不主动删除旧 origin 下数据库或监控队列。更换 Electron 页面 origin 会隔离 IndexedDB/localStorage 等存储，明确提示新版本从新存储开始，Web 在原 origin 使用新的业务数据库命名空间避免旧 schema 冲突。新存储初始化不得伪装为旧数据库降版本升级；同一新模型后续迭代仍需正确版本管理。监控初始化对身份/同意状态的缺省语义单独验证，不静默扩大采集范围。

### 4. 两引擎契约与状态机

MediaPort 保留命令/事件核心，扩充 engine readiness、实际首帧、buffering、dimensions、track selection 与统计接口。播放源改为能描述媒体身份及 backend 所需读取引用的判别联合，移除必须携带 HLS URL/generation 的假设。不要用空字符串 URL 或虚假 video 元素迁就旧类型。

自动模式选择规则：已知输入容器/所选轨不支持原生则直接 Canvas；unknown 可试原生。原生后续明确 decode/not-supported 时允许同一逻辑加载一次自动 Canvas 回退；文件、权限、取消、自动播放受阻和纯慢不触发兼容升级。选择了原生无法可靠切换的音轨时，可主动切 Canvas，这属于用户命令，不消耗无限自动错误重试。

回退保存 media time/paused intent/rate/volume/mute、选定音轨/字幕、偏移、画面旋转和弹幕设置。先静音停止旧引擎，再激活新引擎；自动回退失败进入可重试错误；手动切换失败按下述规则恢复，不能两边同时发声。尝试标识绑定一次 logical load，重试和重新加载的重置语义明确，不能按临时 URL 生成新回退额度。

seek 由最新 generation/AbortSignal 控制；先定位必要关键帧，解码丢弃目标前帧，到目标画面与对应音频准备好后发布 seeked。源时间与 UI 时间通过唯一 offset 映射，不能重复偏移；连续 seek、暂停期间 seek、片尾回跳、非零起点都验收内容时间。首帧表示实际绘制或原生呈现，不是仅 decoder 返回或 currentTime 推进。

### 内核设置与切换反馈

现有设置的“播放”分类新增“播放内核”：自动（默认）/原生（H5）/兼容（Canvas），两端共用并存储为全局 preference；actualEngine 单独展示。无媒体时仅保存偏好，实际内核为空。Canvas 仍优先 WebCodecs，libav.js 与线程数属于播放信息，不增加强制软解或线程选择开关。

固定 H5 失败不自动改内核，提供“使用兼容内核重试”，只写当前 logical load 的 override；切集/重新打开清除 override，沿用全局偏好。固定 Canvas 失败明确报错。用户修改全局偏好时取代当前 override；如果实际 backend 无须变化则直接提交有效偏好，否则仅在目标画面和所选音频就绪后持久化。待应用选择与已提交偏好分离，失败不写入设置。

切换保存原状态，先停止旧声音再激活目标，统一时钟保持连续。手动切换失败尝试以原内核恢复；恢复失败进入明确错误，禁止无限回滚。自动失败回退不往返。快速设置变化、seek 或切集统一按最新意图取消，恢复也受 generation 约束，不能恢复过期影片；旧输出不能提交设置或通知。

自动切换使用同一非阻断反馈从“正在切换兼容内核…”更新为“已切换到兼容内核”，首帧及音频就绪才成功；失败更新为原因与恢复入口，后台取消静默结束。预判后直接 Canvas 简短说明当前内核，不捏造 H5 错误。用户手动操作按独立 attempt 反馈，不受自动一次提示去重误伤。控制栏、字幕、弹幕及快捷键共用，差异由实际能力说明。

现有遥测新增 preference、目标/实际 engine、trigger（设置修改/自动回退/当前影片重试）、结果和恢复结果，沿用同一 logical load；未提交偏好不计设置成功，取消不计解码故障，不重复观看/完成/连播事件。decoder backend、线程模式仍由媒体诊断记录，遵循采集开关与脱敏。

### 5. Canvas 视频和音频输出

WebCodecs 优先；E-AC-3/AC-3、DTS 使用官方扩展，HEVC 软件路径使用 libav.js decoder-hevc。WASM 解码与可行的渲染放到 Worker，UI 线程只承接必要的状态与交互；Worker 内 OffscreenCanvas 是否适用按色彩和兼容验证决定。

视频保持 VideoSample/VideoFrame 或 YUV 平面到 GPU，不默认做 CPU RGBA 转换/读回。CanvasSink 适合已验证 SDR 和缩略图，配置 poolSize（起点 2–3）并避免持有会被覆盖的池画布。HDR 使用独立颜色处理适配，明确位深、range、matrix、primaries、PQ/HLG 和 tone-map 算法；普通 Canvas 或 server toRgbSample 不能证明 HDR 正确。输出画面不得先丢失高光后再声称恢复 HDR。本次增加支持设备上的 WebGPU HDR 输出验证：使用 VideoSampleSink 保留高精度帧至输出，验证 HDR10/HLG、SDR 回退、显示器切换、字幕弹幕亮度及 SDR 截图。通过验证的设备路径纳入交付，未通过路径明确记录并保持正确 SDR；不再笼统将所有 Canvas HDR 排到后续。

音频解码输出 PCM，Web Audio 输出；首版可借鉴 AudioBufferSink 调度，但产品版必须处理有界预排、停止旧节点、重采样、声道映射、切轨及不变调倍速。时间伸缩由可复用 DSP/AudioWorklet 实现并独立验证，不能将 AudioBufferSourceNode.playbackRate 当作不变调实现。

以音频实际消费进度建立统一逻辑时钟，校准设备输出延迟；欠载冻结/重建音视频锚点，不按墙上时间无限跳过未消费数据。无音轨使用单调时钟，暂停/倍速/seek 重置锚点。初始应用视频输出队列上限 3 帧、音频 ahead 上限 0.5 秒；解码器内部参考帧不受这两个数字约束，单独观测。后台页、睡眠唤醒、音频设备变化和 GPU context lost 都有明确暂停/恢复或错误行为。

### 6. 字幕、字体和工具

libass 保留，改为独立 Canvas + 统一时钟，同步 pause/rate/seek/timeOffset。字幕层与视频层共用可见画面矩形和旋转策略，不直接绑定 HTMLVideoElement。SRT/WebVTT 文本转换需保留文本和基本时间/样式，WebVTT 特有布局无法等价时明确限制并测试。

Matroska AttachedFile 字体通过 MediaBunny 获取，按 MIME/内容校验、限制体积、创建受控资源交给 libass；不要执行附件。字体/字幕按媒体 owner 释放，单轨失败降级为无字幕，其他功能继续。字体还原需要与参考截图比较，而非仅测试解析结果。

截图与预览优先 MediaBunny VideoSampleSink/CanvasSink，截图是旋转和色彩处理后的纯视频画面，不含 overlay；后台缩略图用独立可取消读帧任务，不能推动主播放 seek。预览请求 latest-wins，复制需要长期持有的池画布结果。媒体无法解码时图片工具给出明确不可用状态，不暗中走播放转码。

### 7. 部署与能力表达

能力模型拆成平台文件/窗口能力、当前源及 backend 媒体能力、已实现业务能力；删除 web=false 的截图/内嵌字幕硬编码。Node imports 不进入 Web bundle。固定 MediaBunny 与扩展版本，确保单例注册，不重复打包两份核心；WASM/Worker 本地静态资源按需加载，不依赖运行时第三方 CDN。

HEVC 多线程为 Electron 打包态与正式 Web 的交付要求，依赖 SharedArrayBuffer，分别配置 Vite dev/preview、Electron 自定义 scheme 页面及生产站点的跨源隔离，检查 crossOriginIsolated、Worker 与 WASM MIME/资源路径（本次不设置 CSP）。对封面、API、字体和遥测的跨源请求回归，避免隔离头破坏既有功能。运行环境缺少隔离或线程启动失败时可使用经验证的单线程回退并报告原因，否则明确错误；这种降级不算正式部署多线程验收通过。遥测记录 target/mode、配置线程数、线程池与实际解码线程的区分、回退原因和内存峰值，不以 Worker 总数当作解码线程数。

### 8. 删除与规划迁移

用户已授权删除播放转码。关口通过、原生/Canvas 入口基本可运行后，移除旧入口，再删除 main media-gateway 下仅服务 HLS 的 coordinator/factory/publisher/segment/job/cache，删除 FFmpeg pipeline compiler、HLS preset、播放 encoder/preflight/target-init 与旧 renderer planner、HLS adapter、generation seek。

共享 service/executor/runtime/media-tools 先按真实调用拆分：截图、字幕、probe 迁移后删除其重复实现，剩余用途保留最小工具，不要求旧 H.264/AAC 编码能力。原文件 Range 服务若仍被使用，拆为独立读取模块；不能沿用整个 HLS Gateway 才能直读。

同步 shared media 类型、IPC router/preload、bootstrap/窗口销毁、package/lockfile、构建资源、自检开关、诊断 UI、脚本和专属测试。保留通用取消/自动播放/新模型历史行为与对应测试，删除已获授权放弃的旧路径迁移分支。历史 spikes 标为历史证据而非新路线验收；旧运行脚本移除或明确停用，不误导新开发者。

在旧 change 的 proposal/design/tasks 增加替代范围说明和新 change 链接，保留未完成 checkbox，不自动 archive。rebuild-observability-stack 继续有效；新事件记录 engine、decoder backend、fallback reason、首帧/seek/欠载/队列峰值，删除旧 job/segment 参数，不上报本地路径或媒体内容。

### 9. 验收与性能预算

收尾统一建立并复用 reference machine/sample 清单：OS、CPU、GPU、RAM、Electron/Chromium/decoder 版本，明确强制软件路径。必测 1080p 24/30fps HEVC Main 10、HDR10/HLG、E-AC-3/DTS/常见音频、长 GOP、VFR、非零起点、多音轨和多字幕。4K 作为压力场景记录上限，不作为所有机器必须实时的承诺。

初始验收目标（测前冻结，不得失败后无记录放宽）：在声明的参考机器上本地 1080p 软解连续 20 分钟，稳态输出跟上源帧率、非 seek 丢帧比例低于 1%、音画偏差绝对值不超过 100 ms；冷首帧不超过 5 秒，seek 恢复 P95 不超过 2 秒、单次不超过 5 秒，目标画面误差不超过 1 帧或 50 ms 中较大者。2026-09-07 用户明确接受本次已测 seek P95=2172.5ms 的偏差，此结果作为当前版本的性能例外，不再阻塞交付；2秒仍保留为优化目标，其他指标不变。记录首用 WASM 初始化与暖启动分开。解码器参考帧之外队列遵守预算，多次切源后资源数回落，无随播放时长线性增长的应用缓存。

每个平台分别记录模块测试、真实应用媒体证据、打包/部署证据；缺少 macOS x64 或 Windows 机器只能标未验证。Chrome/Edge Web 部署必须实际运行，不能用 Electron 成功代替。HDR 以已知参考色块/灰阶和参考渲染进行数值及视觉校验，屏幕截图单独不能证明 HDR 输出。

## 风险与权衡

- HEVC 使用固定发布包；已有线程、内存与退出修复不在播放器仓库重复维护。包迁移的接口差异需要一次冒烟；字幕提取仍需补齐，真实阻塞须处理，不把短测视为全链路通过。
- Web 功能完整增加文件权限恢复、字幕解析和资源部署工作，但这些是已确定的产品方向，不能以 Node 快捷方案替代。
- 多引擎仍需维护两条呈现链；通过共用业务与单一时钟减少差异，不把原生引擎的具体事件伪装成所有后端真相。
- 删除 HLS 会移除原有未验证/部分可用的兼容路径；保留旧分支和快照用于对照，最终新分支不继续依赖旧链兜底。
- 预算和性能阈值是设计目标，不是当前实测结果；开发快照和旧实验均不作为新引擎验收。

## libav.js 决策、实验与正式适配边界

用户已确定接入 @suemor/libav-hevc@0.1.1。以下为已有自建实验的历史基线 c05a676，libav.js 6.10.9.0 / FFmpeg 9.0 / Emscripten 6.0.5，decoder-hevc，-O3。该自建构建路径退出播放器日常构建，保留历史证据。当前发布包同样基于此上游基线，包含普通/线程版及CJS/ESM资源、类型和源码材料；从官方npm固定精确版本及lockfile integrity，复制同一包的dist与必要manifest/许可材料，保留文件名，使用版本化资源目录与明确base，不用latest或运行时CDN。

正式适配边界：MediaBunny 负责解封装，libav.js 只补 HEVC 解码；不按另一 FFmpeg 版本的数字 codec ID 初始化，优先按名称/当前构建映射。时间戳和码流配置经正式适配传递。GPU 渲染、同步、取消、字幕及策略属于 Marchen，不修改 FFmpeg 解码算法来承接业务。

以下为历史实验暴露的处理项（已完成修复见 evidence，不作为重新执行清单）：

- ff_init_decoder 缺少线程数配置：实验增加 threads 并在 avcodec_open2 前设置，正式封装应验证配置生效，失败明确报告，线程数不写死为 4。
- 线程子进程早期 cwrap 数值函数绑定为 undefined：实验用延迟解析绕过，需定位工具链/上游版本边界并回归线程与非线程接口，避免未经评估全局补丁。
- Worker 内加载器与 pthread 入口错位：实验显式 base/wasmurl，并用局部 __filename 临时指定胶水入口。正式实现提供稳定入口，验证 HTTP 和 marchen scheme、嵌套 Worker、打包资源路径，不直接复制临时全局变量绕过。
- 默认 24 MiB 初始内存下出现 ff_set_packet 写入越界：改为 256 MiB 初始线性内存后实验通过，扩容根因仍未定位。必须验证共享内存视图更新、帧所有权、并发增长和释放；不能只增大内存宣称修复。最终初始/上限预算应含解码参考帧、线程栈及渲染/音频开销；线性内存配置不等于 RSS。

已有证据：M4 / Chrome 152.0.7977.77 headless，Arcane Main10 1080p、BT.2020/PQ，57.292 秒附近 180 包；MediaBunny 按需读取约 8 MB。外层专用 Worker 内普通 WASM 的 mode=direct，非 UI 线程。各配置 3 轮中位数：普通 1 线程 56.5 fps；线程构建 1/2/4 线程分别 52.1/74.2/124.7 fps，2 线程范围 41.9–92.0 fps。全部输出 180 帧，首帧 YUV420P10LE，未观察到时间戳倒退。线程模式 target=thr/mode=threads 且隔离开启，看到的 10 个配套 Worker 包含运行时线程池，不代表 10 个解码线程。

上述为固定顺序短测、指针输出，不含 JS 像素拷贝、GPU 渲染、音频、字幕、像素正确性对照或长期内存。不能将约 125 fps 当作线上承诺，也不能代替 Electron、Windows 或正式 Web 验收。证据摘要进入正式仓库时保留脱敏环境/版本/命令/统计及补丁来源，不提交私有影片、压缩包 fixture 或机器绝对路径，不依赖临时目录作为永久验收入口。既有任务保持未完成，实施阶段落实可复现验证后再勾选。

## 发布包接入与验证节奏（本次确认优先于历史实验待办）

1. 首先执行任务2.9，将播放器切到 @suemor/libav-hevc@0.1.1，保留已有 CustomVideoDecoder、Worker、色彩与业务适配。只在需要能力探测时注册软解器，WebCodecs优先策略不变。
2. 播放器只负责安装固定包、复制版本一致的静态资源及调用适配，不继续维护并应用一套本地 libav 源码补丁，也不将 Emscripten 设为普通播放器构建依赖。自建构建与修复记录仅作为历史证据保留；包接入成功后清理重复的活动构建入口。
3. 必要的缺失能力或阻塞修复在 独立的 libav.js 仓库 完成，按该仓库发布流程构建、定向验证、发布新版本，再更新播放器的精确版本与lockfile。用户已授权这一路径；不得覆盖已发布版本，不把可选优化升级为接入前置条件。
4. 历史差异：0.1.0已包含线程参数、共享内存视图和退出兼容修复，但没有播放器本地新增的 libavjsMemoryStats、固定5个Worker池、768MiB上限。接入时适配诊断为可选能力，缺失时返回不可用；线程数与池大小区分，不能把本地自建参数宣称为发布包参数。应用输出队列、取消和关闭策略仍保留，细粒度诊断/编译预算优化按实际需要在库仓库后续发布。
5. 每批实现运行相关单元测试/类型或定向lint检查，加一个代表样片冒烟即可；不逐文件、逐任务反复跑全量检查。接包时对资源加载、必要API、代表Main10输出、关闭及所需线程路径做一次冒烟。此前已通过的像素/色彩/生命周期证据在代码路径未变化时复用。
6. 完整线程矩阵仅在解码运行时或线程配置变化时执行；完整色彩对照仅在色彩转换变化时执行；4K压测按相关性能变更或异常需要执行。不要为了性能数字本身反复重建WASM、增加样片或扩张验证工具。
7. 任务2.4/2.7/2.8的剩余正式场景与第8/10节合并取证，安排在双内核可运行之后，不阻塞第3–9节实现。保留任务状态和历史证据，引用同一收尾结果即可，不为多个checkbox重复执行同一检查。20分钟播放、Electron/Web构建及部署集中收尾一次；新变更影响或失败时再定向重跑。
8. 本修订减少重复与前置验证，不删除功能或降低已有性能目标。其他目标机器按发布平台集中验收，缺失机器明确标记未验证；不得凭本机结果声称全平台通过。

## 字体附件预检（用户确认）

调用 MediaBunny 附件查询之前，先通过共享按需来源扫描 Matroska 元素头，累计 Attachments 容器体积（包括非字体附件及结构开销），不读取附件载荷。累计超过每媒体 32 MiB、长度未知或无法可靠预检时，不查询附件，回退默认字体并返回非阻断提示。预算内仍由 MediaBunny 提取字体，随后校验字体类型、内容及字体资源预算。取消不关闭其他消费者的来源，切源释放字体资源。此预算约束附件输入体积及缓存，不声称浏览器/解码器总 RSS 小于 32 MiB。

### 0.1.1 与正式应用集成记录

按用户后续明确指令，已先在独立库补充内存诊断、固定5个pthread Worker池和768 MiB上限，发布0.1.1并升级播放器。上述0.1.0能力差异仅为接包历史，当前运行时已使用0.1.1诊断，未重新引入本地补丁。Sentry固定IPCMode.Classic，经现有Preload通道通信，避免默认Protocol注册覆盖marchen的secure声明。Canvas保留容器时间坐标，开头和seek目标不早于首个音视频时间戳，字幕不重复平移。


用户范围调整：移除播放器手动截图按钮及保存/下载、对应能力标记和调用埋点；保留进度预览与历史封面取帧。本条替代前文手动截图交付要求。


浏览器范围调整：Canvas 仅在具备所需 API 的桌面 Chromium 与 Electron 开放；Safari/Firefox 的 Canvas 设置置灰，旧 Canvas 偏好按原生路径处理，禁止自动选择、自动降级和错误页重试进入 Canvas。无法播放统一使用中文错误界面并提供可展开的诊断详情。
