# Canvas 音频与共用字幕时钟实施记录

## 已验证的实现边界

2026-09-06，同一 `feat/player-engine` checkout。

- Canvas MediaPort 通过 Worker 使用 MediaBunny VideoSampleSink / AudioSampleSink，HEVC 软件路径使用已发布的 `@suemor/libav-hevc@0.1.1`。音频扩展固定 `@mediabunny/ac3`、`@mediabunny/dts` 1.55.7。
- 倍速使用 `@soundtouchjs/audio-worklet@2.1.1`（MPL-2.0），Worklet 静态资源由 `media:prepare` 从锁定包复制；播放前使用独立 OfflineAudioContext 校准 DSP 启动延迟。
- SourceNode 与 DSP 使用同一倍速。多声道按 Web Audio `speakers` 规则下混为立体声；诊断记录输入声道与实际输出两声道，不宣称 Atmos 或直通。
- 双音轨切换从当前媒体时间重新准备音视频，停止旧排程并重建 AudioContext/DSP，避免残留旧轨声音。连续 seek 保留原播放意图；seek 中暂停不会废弃目标帧等待。
- Worker RPC 超时终止线程，切源清除旧播放 Promise 和缓冲状态；DualMediaAdapter 先退订、销毁旧内核，再创建新内核。
- libass 使用独立 Canvas，由 Runtime clock 同步播放、暂停、倍速和偏移。字幕尺寸取实际媒体尺寸，旋转与视频保持一致，卸载销毁 Worker 后释放字体/字幕 URL。

## 定向证据

1. Chrome OfflineAudioContext，48 kHz，输入仅在 5.1 中心声道放入 440 Hz 正弦波：0.5× / 1× / 1.5× / 2× 两路输出均为 440 Hz，RMS 约 0.25。证明本次 DSP 接法保调且下混保留中心声道。
2. 合成 1080p HEVC Main10/PQ + EAC-3 样片：实际强制软件路径报告 4 个解码线程，首帧 1920×1080，播放、暂停、1.5×、连续前后 seek 和 seek 中暂停通过，无媒体错误。
3. 两条 EAC-3 音轨（6 声道日语标记、单声道英语标记）：从第一条切到第二条成功，回执 selectedId 对应第二轨，实际输出为立体声。
4. 实际 Chrome/libass 渲染使用 4,255,008 字节内嵌字体：统一时钟 5.5 秒显示底部字幕（y=329–349）；8.5 秒加 1 秒偏移显示顶部字幕（y=13–32），释放后字体 URL 数为 0。
5. `libass-subtitle-adapter.test.ts` 3 项测试通过；`dual-media-adapter.test.ts` 2 项测试通过。覆盖单实例释放、偏移仅应用一次、暂停/倒退/倍速、旧事件隔离、控制值保留与一次兼容回退分类。

以上为离线 DSP、独立浏览器适配器及定向测试证据。完整播放器宿主已开始接入，不能据此宣称打包态、20 分钟连续播放、所有设备音画偏差或全平台验收通过。真实长片所在外接卷当前不可访问；不将合成短片代替该项正式验收。

## 正式 Web 宿主短测补充

通过 Vite 正式页面的文件 input 导入合成 HEVC Main10 + 双音轨 EAC-3 MKV，弹幕匹配接口在测试中返回空列表，点击“不加载弹幕”。实际 NativePlayer/DualMediaAdapter 选择 Canvas，5 秒后画布为 1920×1080、可见，中心像素 `[9,7,131,255]`，进度推进至约 4 秒，`crossOriginIsolated=true`，无未捕获页面错误。此处使用正式播放适配器，不复制另一套演示 decoder。

首次运行暴露 Vite 动态发现音频依赖导致页面重载、File 授权丢失；已为 MediaBunny、音频扩展和 SoundTouch 配置预优化，修正后导入链路通过。dev/preview 隔离响应头已配置，正式站点和打包验证仍待收尾。

原生/手动切换补充：正式 Web 页面导入合成 H.264/AAC MP4，确认原生 640×360、时间推进；暂停后通过播放器设置选择兼容内核，Canvas 保持 640×360 并完成首帧后才写入 `enginePreference=canvas`。失败恢复测试发现 core 将 startTime 继续解释为旧分片 offset，已改成只有显式 timeline.offset 才用于时间坐标转换，恢复原文件初始位置与逻辑时间不再重复偏移。

## 设置、音轨与正式字幕整合

- 实际页面阻断 Canvas Worker 的加载后，手动切换失败恢复原生内核至约 1.44 秒并保持暂停；设置仍为 auto，无失败偏好写入。
- 正式页面通过音轨菜单从日语 EAC-3 切换到英语 EAC-3，IndexedDB history.audioTrack.language 为 eng，页面无未捕获错误，显示实际立体声输出。
- 正式 Web 页面导入带内嵌 ASS 和字体的可播放 MKV，在 5 秒时字幕 Canvas 有 3866 个非透明像素；暂停后旋转 90°、窗口缩到 1000×640，字幕 Canvas 更新为 640×640、保持可见，无页面错误。
- Electron 内嵌目录和解析已复用同一 embedded-catalog / Matroska 读取；删除字幕提取/转换 IPC 和旧 FFmpeg 相对字幕索引入口。Node 仅选择/读取外挂文本及发现同目录文件，SRT/VTT 在 renderer 转换。
- HISTORY 音轨偏好恢复核对语言/编码/名称/声道，不盲用编号；内嵌字幕保存 UID/编码并重新核对。Web 外挂保留原始文本（每份 8 MiB，每媒体累计保存 32 MiB）；超出累计预算保留本次播放并提示下次重新选择。缺失外挂按单轨降级，不关闭其他字幕来源。
- Web 外挂恢复测试使用新的 catalog 实例重建 ASS 输出，验证中文与 Dialogue 内容及释放；不能恢复内容时明确要求重新导入。
- core 17 项、相关 runtime 21 项、字幕 catalog/preferences 5 项、平台端口 2 项定向测试通过；本轮类型检查通过。完整打包、非零起点长片、长时间音画同步和其他机器的验收仍按收尾计划执行。

## 2026-09-07：选择策略与旧链路清理

- 自动选择只用主要视频/实际音轨判断 H5 MIME，未选中的备用 E-AC-3 轨不再误触发 Canvas。
  非主要音轨在自动模式使用 Canvas，固定 H5 仍遵从设置并明确报告无法保留音轨。
- `engine-policy.test.ts` 与遥测测试共 28 项通过；主进程 12 个文件、26 项测试通过。
- 已删除 main media-gateway/ffmpeg、播放转码 IPC、renderer HLS/planner/generation 恢复、
  shared 旧播放计划类型及 hls.js 依赖。electron-builder 排除旧 FFmpeg 资源，测试制样 FFmpeg
  仅用于开发验收素材，不是播放器第三条回退链路。
- Web/Electron 都开放字幕、截图与用户文件列表；Electron 单独保留同目录发现。
- 更新 README、AGENTS 和 docs/player-engine-deployment.md，明确发布包0.1.1、资源 MIME、
  COOP/COEP、无 CSP、新存储与未验证平台边界。
- 本轮尚未完成正式打包、生产 Web、多平台、HDR 显示器或20分钟真实长片验收。

### 本轮追加运行证据

- 正式 Web UI 打开原 Arcane Main10/HDR/E-AC-3 样片，Canvas 1920×1080 可见，8秒短测
  页面显示约5秒/40:31，跨源隔离 true，无 pageerror。仅证明本机短时首帧播放，不是20分钟验收。
- 正式 UI 悬停预览得到240×135缩略图，暂停位置从1.177到1.218秒（点击暂停前差值），
  预览完成后仍暂停；没有页面错误。credentialless 下 crossOriginIsolated=true。
- 带约4.979秒起点的 MP4：Canvas 保留容器坐标，seek(0)落在4.979，继续后到5.610。
  音频设备变化事件导致暂停；无错误，音频预排峰值0.499秒。
- 媒体/runtime/telemetry 共32个测试文件128项通过；本轮类型检查通过。

### 构建与协议

- Electron/Web 构建成功，本地 Source Map 上传关闭；Web preview 构建产物播放 Arcane
  Canvas1920×1080，约6秒/40:31，无页面错误，跨源隔离成立。
- Electron44 协议专项：secure=true，randomUUID可用，跨源隔离成立；HEVC运行时mode=threads，
  线性内存24MiB，1 active+4 idle pthread；Range读取正确，撤销后404。
- 完整应用冒烟发现 Sentry 默认 IPCMode.Both 再注册协议覆盖 marchen 安全声明。
  已改为 SDK 的 IPCMode.Classic，使用既有 preload IPC，后续完整应用结果独立记录。
- 增加旧进程入口/依赖/打包资源边界断言，验证通过；全仓 lint 0错误、80警告（主要既有React规则）。

### 资源路径与 HDR 环境边界

- 首轮长测在180秒中止：libass WASM 返回 HTML。定位到 vite-plugin-static-copy 4 保留目录层级，
  实际复制到 assets/node_modules/...，现已在两套配置指定 rename.stripBase=true，WASM 位于
  assets/subtitles-octopus-worker.wasm。失败轮不算长期验证通过。
- HEVC准备脚本只保留当前版本的自动生成资源，旧0.1.0/实验目录不再随产物复制。
- 打包 files 改为明确收集 main/preload/renderer/resources，ASAR从约648MiB减至约197MiB；
  检查根目录只有node_modules/out/package.json/resources，无.cache/test-results/out/web/旧FFmpeg。
- macOS arm64 .app 确認 app.isPackaged=true，使用开发环境开关隔离userData，短样片Canvas1920
  可见、secure与隔离均true、无页面错误。该测试关闭了生产遥测；生产Sentry另有构建态应用证据。
- 当前可见Chrome窗口探测：WebGPU可用（Apple/Metal3），dynamic-range与video-dynamic-range
  均非high。没有HDR显示输出证据，6.9保持未验证，不以浮点画布或截图代替。
- Web用户多文件列表自动连播，从6秒Canvas样片切到20秒H5样片，标题与当前媒体一致，无错误。

## 本轮集中结果与未通过项

参考机器为 Apple M4 / 16 GiB，Chrome152.0.7977.77；Electron44.0.0。开发工具实际为Node22.22.3，
与项目要求的Node24存在差异，未将本机工具版本冒充要求版本。

- `web-hevc-20min.json`：正式Web构建的本地preview，强制HEVC软件解码，1200.27秒完成；
  页面进度1200秒，观察到约28800帧输出，始终threads模式。每分钟线性内存90439680字节，
  5个活跃pthread；全程无pageerror。帧计数包括辅助取帧，不是呈现/丢帧率，内存不是进程RSS。
- `web-hevc-seek.json`：12次跨区间定位，324.7–2172.5ms。最近秩P95=2172.5ms，超过冻结的
  2000ms，因此不通过。计时从Worker seek发送到Canvas像素回读，尚不含前置AudioContext准备；
  不能把它包装成完整点击耗时达标。原脚本关闭按钮选择器错误不影响已采到的seek样本；退出单独验证。
- 单独的正式UI退出测试：创建2个解码Worker、关闭2个，无pageerror。
- 无音轨样片单调时钟推进约1.202秒，暂停无漂移，seek到1.5秒，输出声道为0。
- 真实HDR样片注入时间跳变与WebGL context lost：分别暂停，GPU错误为可重试错误；模拟事件
  不替代所有真实睡眠/设备组合的系统验证。
- 最新意图测试：Canvas未就绪时选择H5，最终pref=native，Canvas隐藏，旧请求未提交。
- 135项media/runtime/telemetry、17项playback-core、27项main、17项player-loading测试通过，
  共196项。类型检查通过。后续格式整理不改变这些路径语义。
- 历史恢复现在由协调器统一执行；HISTORY只保存source，不再双写旧path；Electron用source.path
  恢复，Web库内重新匹配沿用记录的hash/name/size与既有代理。路径边界测试同步更新。
- 当前仅有经验证的HDR→SDR输出。当前显示器探测不支持HDR；HDR原生输出仍待实现和目标设备验证。
  其他平台/正式Web部署、实际非seek丢帧率和扬声器端音画偏差仍未验证，不进入用户验收或归档。

### 最终产物复核

本机macOS27.0。最新Electron/Web构建成功，构建上传关闭；全仓lint为0错误、80警告。
最新未签名macOS arm64 .app的Arcane短测：app.isPackaged=true、secure=true、隔离true，
Canvas1920可见，进度约6秒/40:31，无pageerror。测试使用隔离的开发userData；未发布/公证。
最终ASAR约171MiB，含正确的libass WASM，不含实验缓存、测试样片、Web重复产物、旧FFmpeg和旧HEVC版本。

清单50/69完成。按marchen-apply的阻塞暂停规则，本轮停在seek性能门槛未达标及HDR设备缺失；
未放宽门槛，未请求用户验收，未提交或归档本分支。


### 2026-09-07 用户反馈修复与性能例外

本段更新上述历史暂停结论：用户明确接受当前 seek P95 约 2.17 秒，2172.5ms 原始测量及其
计时边界不变；不再以超过 2 秒暂停交付，不把其余未测指标标为通过。

- HDR 不可读帧此前直接触发 libav 降级；现在对这类 VideoFrame 使用浏览器 Canvas 绘制，
  保留 WebCodecs 路径，实际绘制失败仍走兼容降级。不是新增原生 HDR 输出；浏览器路径与
  自定义 Hable 映射的色彩一致性仍需专项验证，WebCodecs 后端本身不证明物理硬件解码器选择。
- Arcane Chrome 短测 backend=webcodecs、1920×1080、hdr-to-sdr、errors=[]；暂停恢复调用
  8.59ms，下一帧31.27ms。普通暂停保留有界解码/音频队列，通过 AudioContext suspend/resume
  冻结/恢复；seek、设备变化等需重新定位的路径仍重建。
- 强制软件解码双 EAC-3 音轨短测：暂停、恢复、1.5倍速、连续seek、换轨、seek期间暂停通过，
  errors=[]。上述结果为相关短测，不替代全平台或长时间音画同步验收。
- 弹幕层由20调整为35，位于透明操作层30之上、控制器40之下。真实Chrome鼠标测试：
  悬停150ms内动画currentTime保持83.357ms，状态paused；移开后running，控制器可命中。
- School Days提供的SRT在新配置Web手动导入与Electron自动加载邻近文件均可显示：
  2秒处字幕画布分别2766/10085个非透明像素，无页面错误。本次未复现用户原会话缺字，
  没有修改字幕解析器。该SRT含364条，截止33:36.950，开头为信用币/共和国造币厂等对白，
  与24:55的School Days视频内容不匹配；不能据此断定用户原会话问题只有字幕不匹配。
- 进度悬停缩略图是本变更新增的公共功能，H5/Canvas共用独立预览，不从主播放队列seek取图。

- 补测School Days强制Canvas后手动导入同一SRT：backend=webcodecs，字幕画布1280×720，
  2766个非透明像素，errors=[]；两个内核均能显示。第一次脚本未唤醒自动隐藏的控制器，
  点击被透明操作层拦截；补充鼠标移动后通过，没有将脚本操作失败归为字幕故障。
- 本轮135项media/runtime/telemetry测试、Web类型检查及3个改动实现文件的ESLint通过。
  未重复20分钟长测或完整打包矩阵；代码仍在feat/player-engine工作区，未提交/发布。


### 2026-09-07 进度点击、缩略图与顶部拖拽反馈

- 进度条使用独立pointer id记录拖动意图，阻止默认文本拖动，丢失capture时清理临时进度；
  松开只提交seek并隐藏预览，拖动与实际seek期间不执行辅助取帧。悬停取帧按秒复用，
  100ms防抖，同一秒内微动不取消并重建Worker。没有把任意新位置首次取帧描述为零延迟。
- Arcane开发Web、WebCodecs，连续6次实际鼠标点击跨区间seek全部提交并绘制；首轮Worker
  seek发送到像素回读47.7–153.5ms，第二轮49.4–138.7ms。不是包含所有UI操作的端到端耗时，
  也不覆盖用户原会话全部偶发无响应情况。点击后未立即启动预览。
- 预览首次805ms，再次同位置480ms（含自动化等待）；Worker数均为3，第二次命中缓存，
  退出3个Worker全部关闭。短测没有页面错误。
- 开启悬停暂停时只在弹幕文字节点添加-webkit-app-region:no-drag，原生拖窗空白区域保留；
  Web和全屏不声明窗口拖拽区。Electron测试computedStyle=no-drag，悬停150ms动画时间
  保持184.299ms，移开恢复running，控制器可命中。这是Electron DOM/鼠标注入证据，
  真实系统拖窗与动态滚动文字的原生命中区域共存仍需用户窗口复核。
- 本轮135项相关测试、Web类型检查通过，定向ESLint无错误，原有effect警告仍在。


### 2026-09-07 播放中定位回跳反馈

进度条旧实现把lostpointercapture当作取消，清掉activePointer后pointerup不再提交seek，
会出现拖动目标短暂显示后恢复旧播放位置。改用拖动期间的窗口级pointermove/pointerup捕获，
释放capture不再取消用户意图；pointercancel/blur取消，卸载移除监听器，松开只提交一次。
这说明一个明确的命令丢失路径，不代表已证明用户所有偶发现象均来自同一原因。

Arcane开发Web Canvas/WebCodecs注入capture丢失后松开：提交目标1465.046秒，
189.35ms后完成绘制，500ms后UI仍为1465秒，无页面错误；2个Worker退出全部关闭。
另测pointercancel不提交seek，随后播放中6次跨区间点击全部成功，500ms后UI均保留目标，
Worker请求到绘制45.68–121.10ms。Web类型检查及定向ESLint无错误（原有effect警告保留）。
尝试旧built main加载dev URL的Electron测试未进入可播放状态，不能作为Electron验收证据。


### 2026-09-08 影视库恢复弹幕与启动空白

- 时间轴初始化于0后直接读到历史进度，collect原先会补发整个区间；分配器又用旧item.time
  判断占用，与刚创建的WAAPI动画不一致。现在二分跳过超过250ms的过期弹幕，保留正常
  调度抖动窗口，迟到弹幕以max(now,item.time)占用轨道。新增时钟0→400秒和迟到动画
  起点回归，弹幕包27项测试通过。未拿到截图对应影视库条目，未宣称原文件现场复现。
- BrowserWindow设置系统主题底色，HTML在业务模块加载前读取next-themes的theme并展示
  启动提示；React接管root后替换。没有调整监控初始化顺序，也没有测得1.5秒加载耗时下降。
  Chrome禁用业务入口的检查：深色背景rgb(18,18,18)，浅色rgb(250,250,250)，启动文字
  均可见。Node/Web类型检查和改动核心文件ESLint通过，尚未重跑Electron冷启动计时。


### 2026-09-08 启动分析与交互补齐

- 按用户要求删除启动提示，保留主题底色。业务模块提前与监控并行加载，mountRenderer
  仍等待监控初始化，初始化App、路由埋点和React错误处理保持在挂载阶段。加入performance
  标记定位等待位置，不上报文件名。Chrome开发Web首屏324个请求，冷FCP约3032ms，
  预热后FCP约552–700ms；当次开发监控初始化不到1ms，主要耗时是业务模块加载转换。
  冷测同时存在本地构建负载，因此不用于严格前后性能结论。正式Web构建preview三次FCP
  约251–285ms、16–17个请求；没有同条件旧版对照，也不是Electron进程冷启动耗时。
- 控制器焦点锁只用于focus-visible键盘导航，鼠标点击不再永久阻止自动隐藏。实测
  鼠标点静音后隐藏控制器并显示底部细进度；画面双击进入/退出Web全屏通过，控件排除。
- 单个弹幕悬停显示深色复制按钮，位置限制在视口内，移入按钮保留悬停，成功/失败均有反馈，
  关闭悬停暂停设置时仍可复制而不强制冻结。seek、清屏、节点回收会关闭浮层并释放状态。
  浏览器实际剪贴板读取与原文一致，移开后按钮移除、动画恢复。实际项目CSS下检查了按钮外观。
- 135项runtime/media/telemetry测试通过，Node/Web类型检查与定向ESLint通过。Web构建通过，
  未发布；最后按钮宿主/剪贴板不可用兜底调整通过定向浏览器与Web类型检查，未重复完整构建。


### 2026-09-08 全屏/桌面切换暂停、控制栏停留与复制图标

- 移除visibilitychange.hidden主动pause，避免macOS全屏过渡/切换桌面被当成暂停请求；
  Electron设置backgroundThrottling=false保障后台音频排程。Canvas的rAF间隔>1.5秒
  改为按媒体时钟重新定位并保留播放意图，不再强制暂停；此前“注入rAF间隔就暂停”的
  历史行为被本次用户期望替代，真正设备中断/解码错误仍按原错误处理。
- 独立Canvas短片注入2秒rAF间隔：恢复后paused=false、pauseEvents=0、errors=[]。
  Arcane原卷路径本次返回500，改用仓库multi-audio-smoke.mkv，未把短片写成Arcane验证。
- Web实际双击全屏进入/退出通过；注入document.hidden事件后H5仍播放。控制栏静止
  悬停3.2秒保持显示，移出后隐藏并出现底部进度。真实macOS桌面/全屏过渡尚待重启后复核。
- 复制操作改为32px图标按钮，成功显示绿色勾、失败显示红色叉，保留aria-label/title；
  实际剪贴板原文读取和移出恢复通过。135项相关测试、Node/Web类型检查通过；ESLint
  无错误，4个已有警告保留。


### 2026-09-08 浏览器范围与统一错误页

新增Canvas产品支持判断，覆盖设置disabled、旧偏好、原生自动选择、错误降级、显式重试、
activate最终入口；不支持环境忽略需要Canvas的历史备用音轨，优先尝试原生主音轨。
统一PlaybackFailure组件承接播放错误和加载阶段错误，中文主文案、可展开底层诊断；
移除runtime错误重复toast，不可用环境没有Canvas重试入口。

152项相关测试和Web类型检查通过；新增支持范围及不可降级用例。Chrome中覆盖Firefox与
Safari UA策略：旧Canvas设置仍用H5、选项aria-disabled=true，注入H5格式错误后显示统一
无法播放页，没有兼容重试按钮，无pageerror。此证据验证产品限制与UI，不是实际Safari/
Firefox解码验证；原先用音频不支持MKV等待原生失败的测试未触发错误，改用显式错误注入。


### 2026-09-08 Safari仅有声音与准备状态修复

初次准备与内核切换曾共用switching文案，现无pending偏好时显示“正在准备播放”。
Canvas不可用环境在native赋值src前检查容器MIME及独立视频codec；不支持直接显示统一
错误页（包括runtime仍idle的预检失败），不会播放音频。能力报告通过后，首帧验证期间
暂静音，真实视频帧确认后恢复用户音量状态；无视频尺寸不作为首帧证据。

154项测试、Web类型检查通过。Chrome使用Safari UA并模拟MKV不支持：打开测试文件
显示无法播放，HTMLMediaElement.play调用0次，video.src未赋值，没有切换内核文案。
这是支持拒绝路径测试，不是用户截图对应文件在真实Safari上的解码复现。
