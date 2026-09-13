## 动机

Marchen 当前 feat/player-engine 从 feat/player-refactor 的 8ce47f2 开发快照分出。旧方案通过 FFmpeg 转码、fMP4 HLS 和 Media Gateway 解决本地兼容性，但 generation 换源、分片时间线、生产进程重启和缓存管理增加了播放与 seek 的复杂度；实现虽已推进，仍有已知 bug 和未完成验收。旧分支保留为参考，不将其开发快照视为稳定版本。

本变更建立 Electron/Web 桌面端共用的播放引擎：默认自动模式下原生 HTMLVideoElement 优先，兼容性失败进入 Canvas 引擎；MediaBunny 已有能力优先复用，缺口通过小范围扩展补齐。Web 应支持媒体兼容、字幕、字体、截图和播放业务，不能因为没有 Node 就默认关闭这些功能。

## 变更内容

- 复用 MediaBunny 的数据源、音视频轨信息、解封装、解码接入、随机取帧、Canvas 池和附件读取，统一源身份及按需读取；不重复建设另一套全功能媒体库。
- 保留原生 video 引擎，新增 Canvas 引擎，共用播放命令、状态、时钟及字幕、弹幕、控制器、历史业务。明确能力判断、一次性回退、首帧、缓冲、连续 seek、切源取消与资源所有权。
- 浏览器侧使用 WebCodecs 和官方 AC-3/E-AC-3、DTS 扩展；HEVC 软解固定采用已发布的 @suemor/libav-hevc@0.1.1（基于 libav.js 的 decoder-hevc 包），通过 MediaBunny CustomVideoDecoder 接入；Electron 打包态和正式 Web 部署均须支持多线程，接入时复用已有正确性证据，完整播放与部署验证集中到收尾。Node 原生视频解码不作为本变更交付前提，若浏览器方案不达标须修订设计，不能静默削减 Web 能力。
- 补齐双端内嵌 ASS/SSA 与文本字幕提取/转换、外挂 ASS/SSA/SRT/WebVTT、Matroska 字体附件及 libass 渲染。MediaBunny 当前没有字幕轨读取能力，必须验证独立浏览器提取适配，不能声称现成可用。
- 补齐双端音轨选择、字幕偏移、倍速不变调、截图/缩略图、进度恢复、用户选定文件列表及连播；Web 通过文件选择/可用的授权句柄恢复访问，不保存失效 Blob URL。
- HDR10/HLG 输入至少正确映射为 SDR，原生路径可沿用实际可用的 HDR 呈现；本次验证支持设备上的 Canvas HDR 输出，通过后纳入交付，其他设备保持正确 SDR 输出，不承诺全平台完整 HDR。图片字幕 PGS/VobSub、Dolby Vision 专用处理和 Atmos/压缩音频直通不在本次保证范围，必须明确提示而非误报成功。
- 用户已授权删除原有 FFmpeg 播放转码：移除 HLS 生产、编码规划、generation seek、Dynamic HLS、分片缓存和对应 IPC/依赖/开关/遥测/测试。先断开旧播放入口，再按调用关系清理；仍被辅助功能使用的 Node 文件/媒体工具仅在替代完成后删除。
- 在现有播放设置提供自动（默认）/原生（H5）/兼容（Canvas）全局偏好，分别显示实际内核；手动切换保留播放状态，失败不提交偏好，当前影片兼容重试不覆盖全局设置。自动切换采用非阻断提示，首帧就绪后确认成功。
- 保留现有 UI、弹幕、通用播放修复及 Sentry/PostHog，更新能力与事件契约。同步旧变更的替代关系，不能将未完成的旧验收标记为完成。

## 能力

### 新增能力

- `shared-media-access`：MediaBunny 优先的双端按需读取、媒体信息、源身份和授权恢复。
- `canvas-media-engine`：WebCodecs/WASM 驱动的 Canvas/Web Audio 引擎、HEVC 软解关口、音轨、时钟与色彩。
- `dual-engine-orchestration`：原生/Canvas 引擎选择、有限回退、状态恢复、seek 与生命周期。
- `cross-platform-media-tools`：双端截图、缩略图、选定文件播放列表及媒体工具复用。
- `retire-playback-transcoding`：旧 FFmpeg/HLS 播放链及冗余契约的完整退出。

### 修改能力

- `subtitle-playback`：从 Electron 提取、Web 外挂 ASS/SSA 扩展为双端字幕提取、文本格式、字体与统一时钟渲染。

## 影响范围

- packages/playback-core、packages/shared、src/renderer/src/services/player-runtime 与播放器宿主：引擎接口、媒体描述、能力与所有权。
- Renderer 字幕、历史、控制器、媒体导入与文件列表；复用 player-loading、danmaku-engine 和现有 UI。
- src/main/modules/ffmpeg、media-gateway、IPC、preload、bootstrap：删除播放生产链并收缩平台桥接，辅助工具独立运行。
- package.json、lockfile、Electron/Web Vite 配置及部署说明：固定依赖、WASM/Worker 静态资源、按需加载和双端多线程所需跨源隔离。
- 默认验收 Electron macOS arm64/x64、Windows x64 与桌面 Chrome/Edge。Firefox/Safari 记录能力探测及缺失原因，本次不承诺同等 HEVC 软解性能；不扩张到移动端。
- 本变更替代 add-ffmpeg-compat-playback、generalize-media-compat-playback 的播放交付路线。rebuild-observability-stack 继续有效，仅调和播放事件。保留旧历史证据，不自动晋升未显式引用的 Idea，也不执行归档。

### 持久化范围补充

更新 history 的持久化媒体来源和音轨/字幕偏好，保留 hash、观看进度、弹幕及 library 业务数据。全局内核偏好沿用现有设置存储，实际 backend 不作为恢复依据。未上线的转码数据不做兼容迁移；telemetry events 保留队列结构。用户允许不兼容旧版本：旧协议路径和旧业务数据不迁移，新存储保留业务功能，旧数据不主动删除。生产页面改用固定自定义协议 origin，媒体地址采用受控租约标识，移除磁盘路径 URL，保持 bypassCSP=false。

用户确认本次不设置 CSP（meta 或响应头），保留 bypassCSP=false；跨源隔离和受控文件读取独立验收。HEVC 已选定 libav.js，不再执行 libmedia/hevc.js 常规候选对比。播放器从固定 npm 包复制静态资源，不再自行编译 libav。必要的库缺口在 独立的 libav.js 仓库 修复并发布新版本，再显式更新播放器锁定版本；可选诊断与线程池优化不阻塞接入。已有短测不替代交付证据，双端完整验证集中收尾。

### 开发与验证节奏（用户确认修订）

优先推进可运行的双内核播放器。每批开发只运行改动相关检查与一个代表样片冒烟，复用已通过且未受改动影响的证据；不逐任务重复完整线程、像素和色彩矩阵。解码器或色彩路径变更时才重跑相关矩阵，4K压测按需执行。20分钟播放、完整打包与双端部署验证集中收尾一次；后续仅失败或新改动影响时重跑。功能范围、性能目标和双端支持目标不变，未验证平台如实记录，不作为阻塞本地功能开发的前置条件。

## 字体附件预检（用户确认）

调用 MediaBunny 附件查询之前，先通过共享按需来源扫描 Matroska 元素头，累计 Attachments 容器体积（包括非字体附件及结构开销），不读取附件载荷。累计超过每媒体 32 MiB、长度未知或无法可靠预检时，不查询附件，回退默认字体并返回非阻断提示。预算内仍由 MediaBunny 提取字体，随后校验字体类型、内容及字体资源预算。取消不关闭其他消费者的来源，切源释放字体资源。此预算约束附件输入体积及缓存，不声称浏览器/解码器总 RSS 小于 32 MiB。


用户范围调整：移除播放器手动截图按钮及保存/下载、对应能力标记和调用埋点；保留进度预览与历史封面取帧。本条替代前文手动截图交付要求。


浏览器范围调整：Canvas 仅在具备所需 API 的桌面 Chromium 与 Electron 开放；Safari/Firefox 的 Canvas 设置置灰，旧 Canvas 偏好按原生路径处理，禁止自动选择、自动降级和错误页重试进入 Canvas。无法播放统一使用中文错误界面并提供可展开的诊断详情。
