## 执行顺序与验证规则（用户确认修订）

下一项先执行2.9发布包迁移，然后推进字幕最低可用读取、共用媒体来源和双内核实现。2.4/2.7/2.8的剩余验证与第8/10节集中收尾，不再阻塞第3–9节开发。每批仅做改动相关检查和一个样片冒烟；复用未受改动影响的已有证据，完整线程/色彩矩阵仅在对应路径改变时重跑，4K压测按需。20分钟播放、完整打包和双端部署集中执行一次，同一结果可供多个任务引用。未执行的验证不得勾选通过。

已完成的9项记录保留为原适配/自建基线证据，不表示发布包迁移已完成。必要库修复在独立libav.js仓库发布新版本。已按后续用户指令发布并接入0.1.1，包含内存诊断、固定5个pthread Worker与768 MiB实例上限；保留最初0.1.0接包记录作为历史，不再依赖播放器本地补丁。

## 1. 基线、范围与证据

- [x] 1.1 核对 feat/player-engine、旧快照 8ce47f2 与工作区状态，建立按模块的保留/替换/删除清单，确认没有其他任务继续修改同一 checkout
- [x] 1.2 固定 MediaBunny/扩展候选版本及源码，建立能力与测试样片矩阵，记录来源、平台、参考机器和强制软解方式；本地媒体与绝对路径不入库
- [x] 1.3 调和 add-ffmpeg-compat-playback、generalize-media-compat-playback 的替代说明和 rebuild-observability-stack 的共用范围，保留历史与未完成状态，不自动归档
- [x] 1.4 冻结设计中的首帧、seek、音画偏差、掉帧和缓存预算，编制 Electron/Web 分开取证的检查计划；缺少机器标记未验证

## 2. HEVC 适配基线、发布包迁移与收尾验证

- [x] 2.1 落实已选定 libav.js decoder-hevc 的固定提交/工具链/许可证/构建脚本和产物校验，保存普通/线程版；将实验摘要与补丁脱敏纳入可复现记录，不重复库选型
- [x] 2.2 实现最小 CustomVideoDecoder 适配，验证 codec config、Annex B/length-prefixed、B 帧输出顺序、时间戳和 8/10-bit 平面
- [x] 2.3 验证 flush、连续 seek 重置、取消、错误与资源释放，自定义 decoder 不抢占可用 WebCodecs 硬解路径
- [ ] 2.4 收尾时复用已有短测并记录正式1080p 24/30fps软解的吞吐、掉帧、内存和首帧，与10.3合并取证；4K沿用已有压力结果，仅相关改动或异常时重跑
- [x] 2.5 验证 WASM→渲染的位深/色彩传递与 HDR10/HLG→SDR 候选实现；不通过则修订设计，阻止进入依赖的正式替换阶段

- [x] 2.6 正式化 libav.js 线程参数与 Worker/pthread 入口，修复函数绑定时序；验证两种构建，不沿用测试 __filename 绕过作为正式接口
- [ ] 2.7 复用已定位的扩容/退出修复，接包时核对帧所有权与关闭；剩余正式回收/队列预算与10.3/10.6合并验收，诊断缺失报告不可用，不以本地固定池/编译上限阻塞接入
- [ ] 2.8 收尾与8.2/8.3/10.7共同验证Electron打包态与正式Web的实际线程mode、失败降级和跨源资源；复用既有线程收益记录，仅线程实现/配置改变时重跑1/2/4矩阵

- [x] 2.9 接入 @suemor/libav-hevc@0.1.1（最初接入0.1.0，后续升级）：锁定版本/integrity，复制包内同版dist资源和来源材料，适配必要API与可选诊断，完成一次代表样片/线程/关闭冒烟后移除播放器的重复活动自建入口；必要缺口在 独立的 libav.js 仓库 修复发布后更新依赖

## 3. 浏览器字幕提取前置关口

- [x] 3.1 选择可按需读取的 MKV 字幕提取组件或最小补充解析方案，记录接口/许可证和 MediaBunny 未覆盖范围，不引入第二套完整播放器
- [x] 3.2 实现最小内嵌 ASS/SSA 轨读取，验证 CodecPrivate、Block 时间/时长、语言、默认/强制标记、多轨与非零起点
- [x] 3.3 验证内嵌文本字幕、外挂 SRT/WebVTT 转换与图片字幕识别；损坏轨道失败不影响视频
- [x] 3.4 先预检附件容器累计体积（32 MiB），超限或预检失败时跳过附件查询、回退默认字体并提示；预算内从 MediaBunny 读取 Matroska 字体附件接入 libass，验证样式/定位、缺失字体回退、取消和长片内存；关口未通过不得削减 Web 功能继续交付

## 4. 共用媒体来源与业务能力

- [x] 4.1 建立 shared source/metadata 接口与 MediaBunny owner，Web BlobSource 与 Electron 按需读取适配共享消费者租约和取消语义
- [x] 4.2 验证 Electron 原文件 Range/CustomSource 的权限、特殊路径、短读、文件变化与 fetch 可用性；避免整个媒体文件经过单次 IPC
- [x] 4.3 接入音视频信息、轨道选择、色彩与附件查询，复用缓存并区分未知能力/明确不支持/昂贵查询
- [x] 4.4 拆分平台、媒体 backend 和业务能力，移除 Web 内嵌字幕/截图静态禁用及 ffmpegPlaybackStatus 作为总能力开关的假设
- [x] 4.5 实现 Web 文件重新选择/可用句柄恢复，按媒体身份恢复进度与偏好，禁止持久化临时播放 URL

- [x] 4.6 调整 history 媒体来源和音轨/字幕稳定偏好，保留 library/弹幕/telemetry events；全局内核偏好沿用设置存储，验证授权失效与轨道变化
- [x] 4.7 按不兼容旧版本的新模型初始化业务存储，删除旧路径迁移及诊断字段，覆盖新 origin/localStorage/IndexedDB 语义和提示；不搬迁或主动删除旧数据
- [x] 4.8 重建 protocol.handle 固定应用 origin 与受控媒体租约路由，替换生产 loadFile，移除路径 URL，保持 bypassCSP=false，验证 GET/HEAD/Range、CORS/CORP、撤销及双内核读取；不新增 CSP
- [ ] 4.9 验证新 origin 的打包资源、Worker/WASM、跨源隔离、监控身份/采集偏好及开发 HMR；移除旧协议兼容入口和对应测试

## 5. 引擎契约与原生基线

- [x] 5.1 从 source lease/type 中拆除强制 URL/profile/generation 假设，设计 native/canvas 判别联合与可取消资源所有权
- [x] 5.2 扩展 MediaPort 的首帧/缓冲/尺寸/音轨与统计接口，保留 PlaybackSession 命令和业务状态，测试无音轨及错误语义
- [x] 5.3 改造 NativePlayer/useNativePlayerRuntime 为引擎无关宿主，原生 video 保持播放/暂停/倍速/快捷键/旋转/全屏行为
- [x] 5.4 接入自动模式 native→canvas 有限选择与回退，覆盖已知音轨不支持、unknown trial、非兼容错误、手动切换和失败终止
- [ ] 5.5 统一 logical load 与 attempt 标识，验证回退保留进度、暂停意图、音轨/字幕/弹幕设置，不重复触发历史或连播

- [x] 5.6 在两端现有播放设置增加自动/H5/Canvas 偏好与实际内核状态，区分空闲保存、待提交选择与已提交偏好；固定内核不隐式回退
- [x] 5.7 实现当前影片兼容重试、手动切换失败恢复与最新意图取消，验证切集清除 override、失败不保存偏好、恢复失败退出和状态完整保留
- [ ] 5.8 实现自动切换中/成功/失败及直接 Canvas 非阻断提示，覆盖首帧/音频就绪、去重、过期取消；回归共用控制栏/字幕/弹幕/快捷键

## 6. Canvas 视频、音频与时钟

- [x] 6.1 将关口通过的 MediaBunny/WebCodecs/HEVC 适配接入正式 Canvas MediaPort，复用正式数据源，不保留另一路演示解码逻辑
- [x] 6.2 接入 E-AC-3/AC-3/DTS 官方扩展及常见原生音频格式，固定单例注册和 Worker 生命周期
- [x] 6.3 实现 YUV/VideoFrame 渲染、可见画面矩形、旋转及 Canvas 池，设置输出队列预算并禁止默认 CPU RGBA/读回路径
- [x] 6.4 实现 Web Audio 输出与音频消费时钟、设备延迟校准、音量静音、无音轨时钟、欠载冻结与恢复
- [x] 6.5 选择并接入倍速不变调处理，验证暂停/seek/切轨重建预排音频与声道映射，不误报 Atmos/直通
- [x] 6.6 实现最新 seek 优先、关键帧定位与目标前帧丢弃，验证首帧呈现后才结束 seek、失败可重试、旧音频不残留
- [x] 6.7 接入经验证的 HDR10/HLG→SDR 颜色处理，覆盖 range/matrix/primaries/transfer，建立参考灰阶/色块及视觉对照
- [x] 6.8 验证切源、退出、后台页、睡眠唤醒、音频设备变化和 GPU context lost 的资源释放及恢复行为

- [ ] 6.9 验证支持设备上的 Canvas HDR 输出、显示器切换及 SDR 回退，将通过路径纳入交付；覆盖字幕弹幕亮度与 SDR 缩略图，不承诺全平台 HDR

## 7. 双端字幕、字体与媒体工具

- [x] 7.1 把字幕关口适配接入正式 SubtitleCatalog，双端统一内嵌/外挂轨道与偏好，不将技术演示作为最终读取实现
- [x] 7.2 将 libass 改为独立 Canvas 与统一时钟，覆盖字幕偏移、暂停、倍速、连续 seek、旋转与窗口尺寸变化
- [x] 7.3 完成字体附件缓存预算、校验、缺失回退和释放；处理文本转换限制与单轨失败降级
- [x] 7.4 实现 Web 外挂字幕内容/重新授权恢复，按新来源和轨道偏好模型保存，保留新模型历史功能，不迁移旧版本记录，测试刷新、取消与同片再打开
- [ ] 7.5 使用 MediaBunny 实现双端预览和批量缩略图，保证结果时间/旋转/色彩正确，预览不干扰实际播放
- [ ] 7.6 实现 latest-wins 预览、缓存/并发预算与后台任务优先级，验证长时间交互不累积画布和解码器
- [x] 7.7 实现 Web/Electron 用户选定多文件列表、排序、上下集与自动连播，保留 Electron 同目录增强并验证授权恢复

## 8. 构建、部署与诊断

- [x] 8.1 从锁定的 @suemor/libav-hevc 发布包配置 Electron/Web WASM/Worker静态资源与懒加载，保留文件名和版本一致性，不自行编译libav；配置字体资源，固定 lockfile，确保 Web bundle 不引入 Node 原生模块或重复 MediaBunny
- [ ] 8.2 验证多线程所需跨源隔离在 dev/preview/Electron/正式 Web 部署成立，覆盖单线程降级或明确错误，检查 MIME/离线资源，不新增 CSP；单线程降级不得替代正式双端多线程验收
- [ ] 8.3 回归封面、API、字体和 Sentry/PostHog 跨源资源，记录部署要求；不能只在 Vite dev 添加响应头
- [ ] 8.4 将遥测改为 engine/backend/attempt/first-frame/seek/buffering/资源峰值，保留错误与产品分析，避免逐帧事件和敏感路径；覆盖偏好/实际内核、切换触发来源、目标结果与恢复结果，验证一次观看关联与取消去重

## 9. 删除旧播放转码与重复实现

- [x] 9.1 新两引擎入口可运行后断开旧 media.prepare/seek 转码调用、启动 Gateway 与播放 Job 生命周期；保留所需原文件读取服务
- [x] 9.2 删除仅服务 HLS 的 factory/coordinator/manifest/publisher/segment store/job/ahead/back-window 与缓存模块
- [x] 9.3 删除播放 pipeline compiler、HLS preset、编码器规划/preflight/target-init 和 renderer 旧 planner/HLS adapter/generation 恢复
- [x] 9.4 拆分 FFmpeg service/runtime/executor/media-tools 的剩余辅助用途；截图/探测/字幕替代完成后删除重复实现，自检不依赖已移除播放编码器
- [x] 9.5 清理 shared 类型、IPC/preload 导出、窗口/bootstrap 释放入口、旧开关/配置、HLS.js 及仅服务旧路线的依赖和资源
- [x] 9.6 删除或改写旧专属测试/运行脚本，保留通用播放修复和历史实验原貌，补无转码进程/无分片文件的回归断言
- [x] 9.7 更新 README/AGENTS/部署与诊断说明和旧 change 替代链接，核对当前分支不再存在隐式第三条播放回退

## 10. 真实验收与收尾

- [x] 10.1 运行适用的 core/runtime/media/subtitle 单元与集成测试及 typecheck，验证取消、事件顺序、帧所有权和历史恢复
- [ ] 10.2 Electron macOS arm64/x64、Windows x64 与 Web Chrome/Edge 分别验证原生/Canvas/强制软解入口，记录实际 backend 和运行版本
- [ ] 10.3 收尾集中使用正式应用完成20分钟1080p Main10基线，验证首帧/seek P95/音画偏差/掉帧/队列预算，供2.4/2.7引用；4K复用已有压力证据，相关改动或异常时再测
- [ ] 10.4 验证长 GOP、VFR、非零起点、多音轨、字幕字体、HDR10/HLG、连续前后与片尾回跳，核对实际画面时间而非只看 currentTime
- [ ] 10.5 回归影视库、HISTORY/已看、播放器设置/快捷键/全屏/旋转、双端预览/列表/连播、刷新后文件与字幕授权恢复
- [ ] 10.6 验证损坏媒体、缺 decoder、Worker/GPU 错误、文件变化/权限取消与重复切源，确认无旧播放编码进程、HLS 文件或遗留声音
- [ ] 10.7 收尾集中完成 lint、Electron/Web 构建及打包/正式 Web 部署验证（与2.8/8.2/8.3共享证据，不重复执行），检查资源路径和跨源隔离；Firefox/Safari 记录探测与缺失原因，不假报平台验收
- [ ] 10.8 汇总每项需求的证据、限制和未验证平台，输出本地验收入口；所有 required 范围通过后才请求用户验收，不自动归档旧变更

## 当前阻塞与继续入口（2026-09-07）

20分钟本地Web构建强制软解已完成，详细数据见evidence/web-hevc-20min.json。12次seek的最近秩P95为2172.5ms，超过原目标2000ms；用户于2026-09-07明确接受本次约2.17秒结果，此项不再阻塞交付。保留原始计时边界和数据，2.4/10.3仍因其他未完成指标暂不勾选。6.9缺少HDR显示设备（当前Chrome可见窗口探测dynamic-range非high），HDR原生输出未实现验证；现有HDR→SDR保持。Windows/Intel Mac/正式Web部署与完整A/V测量仍待对应环境，不能以本机短测替代。
