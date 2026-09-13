## 背景

当前 feat/player-engine 的 CanvasMediaAdapter 同时管理 Worker 解码、Web Audio、SoundTouch、媒体时间和 CanvasFrameRenderer。use-native-player-runtime 创建原生/Canvas 双适配器并切换显示表面。实验通过 Vite 替换 renderer，未修改正式实现。

2026-09-12 会话证据：HEVC 4K PQ/DTS、Arcane 1080p PQ/E-AC-3、YouTube AV1 1080p 约 60fps PQ/Opus 已通过短播放、停帧、定位的部分实验；用户确认硬解 HDR 高光正常及 HEVC WASM → video 可播放。软解 HDR 完整色彩、长期声画同步和 Windows/Linux 尚未验收，不重新把软解“能否播放”作为阻塞。实验说明位于 scripts/player-engine/tests/real-video-experiment.md，原始结果在 test-results/real-video；执行时需把交付所用摘要与必要证据保存到本 change/evidence，不能仅依赖被忽略的临时文件。

先前 Electron 自动化 loader 注入强制 sRGB 参数，真实文件最终复测已显式移除；历史夹具用户观察保留为有限证据，正式验收必须核对启动参数和显示环境。

## 目标与非目标

**目标：** 原生内核保持浏览器完整播放；兼容内核单一 video 呈现，沿用解码、音频和媒体时钟。删除 Canvas 主画面路径与回退，完成正式入口的暂停、seek、倍速、覆盖层、错误和资源释放契约。

**非目标：** 不保留隐藏 Canvas 回退或 A/B 产品开关，不引入 MSE/转码/音频 MediaStream，不升级解码依赖，不扩展 WebM 导入产品范围、移动端或 Safari/Firefox 兼容内核。字幕和缩略图 Canvas 保留；不交付 Dolby Vision/HDR10+、音频直通或 HDR 截图。

## 决策

### 1. 内核与呈现分离，单一正式实现

```text
native → HtmlVideoMediaAdapter → 原生 video（声音和画面）
compat → MediaBunny / Worker
            ├─ WebCodecs / HEVC WASM → VideoFrame → VideoFramePresenter → 静音 video
            └─ 音频解码 → Web Audio / SoundTouch → 媒体时钟
                                                   └─ 视频调度 / 字幕 / 弹幕
```

将 CanvasMediaAdapter 收敛为 CompatMediaAdapter，构造时注入唯一 VideoFramePresenter；不建立多呈现器注册系统。复用原有 Worker、协议、资源租约和音频实现，名称随实际语义清理，保持分层，禁止复制实验版完整播放器进入产品。

内核状态使用 native/compat；backend 继续描述 webcodecs/hevc-wasm/native。Compatibility renderer 接收并关闭 VideoFrame，不调用 drawImage、importExternalTexture、texImage2D 或重新编码。GPU 帧转移和浏览器内部拷贝不能被标为保证零拷贝。

### 2. 表面隔离与覆盖层

原生与兼容内核各持有独立 video 元素，避免共享 src/srcObject、muted、事件和暂停语义；仅激活表面可见。兼容 video 固定静音，全部声音来自原有音频图。全屏仍作用于播放器容器。

为显示尺寸、旋转及当前表面提供明确引用，替换现有“始终引用原生 video”的假设；字幕 Libass、DOM 弹幕继续使用 runtime.clock。不能把兼容 video 的 pause/waiting/ended/currentTime 直接映射到媒体会话状态。尺寸从媒体元数据/当前帧取得，验证 visibleRect、像素宽高比、旋转与 object-fit 对齐；避免两层重复旋转。

### 3. 帧所有权、背压与首帧确认

Presenter 提供 present、invalidate、dispose 及呈现事件。调用者交出帧后，所有成功、失败、取消路径由 presenter 关闭；包装改时间戳的帧独立关闭，不遗留底层引用。沿用有界视频队列：最多一个待呈现帧和一个在途写入，不按文件速度向浏览器预灌帧。

write Promise 仅意味着接收，不意味着显示。首次显示以及 seek 目标帧必须等当前 generation 的 requestVideoFrameCallback 或等效实际呈现证据；回调必须在送帧前注册。首帧等待设有限超时（初始 10 秒，可根据既有契约调整并说明），与解码超时区分；无帧、拒绝播放或写入失败进入统一错误处理。

媒体 PTS 驱动调度，送入生成器的时间戳适配显示流时间线；分别保留源 PTS、提交和实际呈现计数。实现前核对目标 Chromium 对时间戳的行为，不能假定回调 mediaTime 与重写时间戳相等，也不能简单相减声称音画延迟。逐帧等待显示确认不得无意把吞吐限制到低于源帧率。

### 4. 音频时钟、暂停与统一定位

带音频时沿用现有可听音频时钟和 SoundTouch 延迟补偿，无音频时沿用单调时钟。暂停停止帧调度、冻结媒体时间与 AudioContext，保持兼容 video 播放状态、保持轨道启用；不调用 video.pause，不用 track.enabled=false（会导致黑帧）冒充暂停。恢复沿用原有暂停状态，避免音频重复调度或帧积压。

将 invalidate 放到适配器统一定位流程中，覆盖进度条、快捷键、历史恢复、倍速、换轨与后台恢复触发的 seek。先增加会话/定位代次并终止旧调度，再停止旧轨道及取消在途 writer，建立新轨道，解码目标帧并等待呈现，然后依播放意图恢复。普通暂停不重建轨道；重复设置相同倍速/音轨直接无操作，避免暂停时无故清空画面。

重建轨道是清队列的初始策略，不承诺视觉无缝。等待新帧期间保留最后有效表面的策略不得使用 Canvas 快照；可使用受控新旧 video 表面交接，但同时保留数量必须有界，只有实测需要时才增加。连续请求以最终代次为准，旧异步失败不能覆盖新会话。

源 EOS 和音频尾部完成由兼容适配器判断；MediaStream 不提供文件时长和结束语义。切源、退出、初始化失败时停止轨道、取消回调和写入、解除 srcObject、关闭剩余帧，沿用音频/Worker/租约释放。dispose 必须幂等，取消不能无限等待未完成 write/play。

### 5. 能力、HDR 与失败路径

本次仅采用目标 Chromium 的 MediaStreamTrackGenerator；它是已提供多年但仍非标准的接口，封装限制在 presenter 内。按实际接口、构造/写入及首帧检查能力，结合现有桌面产品范围，不把 UA 检测当完整能力证明。Safari 标准 VideoTrackGenerator 的 Worker 适配留作后续范围。

保留既有硬解/HEVC 软解选择策略，呈现错误不强制切换软件解码；不保留 HdrFrameLayoutError 导致 Canvas 导入失败后切软解的专属逻辑。自动模式保持原生优先与有界兼容重试；原生已经失败后兼容呈现也失败则报告明确错误，不互相回退循环。显式兼容不可用时提示用户使用可用的原生入口。

兼容 video 使用浏览器的视频色彩管理，不实现另一套 HDR shader。源 HDR 识别与实际输出分开；默认标记浏览器管理并附源色彩信息，只有已验证能力范围可报告 HDR。SDR 显示上的映射需以正确观感/参考验证，不能只看 dynamic-range 或 PQ 标签。无法保证正确呈现时缩小支持声明或报错，不重新引入 Canvas。

### 6. 设置、清理与旧提案

旧持久化 canvas 偏好在读取边界映射到 compat，自动和原生值不变，后续写入新值；枚举/schema 校验必须在映射之后，不要求数据库重建。UI 使用“兼容内核”；遥测同步更新内核字段语义及版本/映射说明，不能将历史 canvas 数据误解为新的 video 路径。预览、历史封面保持原输出契约。

删除主画面 Canvas DOM、CanvasFrameRenderer、仅供其使用的 HDR→SDR shader/错误回退、失效能力检测与对应测试，先做依赖引用审计。仍被缩略图或历史实验依赖的共享模块不能误删；必要时将历史实验自带实现隔离至测试目录，不把历史脚本依赖当作保留生产回退的理由。

本变更替代 add-canvas-hdr-output 的实现路线。apply 时在旧 proposal/design/tasks 增加“由本变更替代，勿继续执行”的显著链接，保留原任务完成事实和 evidence；不编造 CLI metadata 状态，不标为完成归档。新增证据统一进入本变更。

### 7. 验证顺序

先完成类型和针对性生命周期测试，再接正式 UI。纯测试重点为旧代次失效、帧恰好释放一次、背压、首帧超时、重复命令和设置映射。真实入口验证 HEVC 硬解、HEVC WASM、AV1、SDR 8/10-bit、PQ 及可取得的 HLG；实验 WebM 只作媒体内核样本，不作为正式导入支持承诺。

Mac Electron 打包态及桌面 Chrome 分别记录 HDR 与 SDR 显示，Windows/Linux 可得环境分别验收，不把 Mac 结果推广。对同片段同后端记录约 60 秒性能、首帧/seek、提交与显示计数、CPU/内存及可得 GPU 指标；至少一份带明确同步点的素材连续播放 10 分钟，检查正常速度、倍速和交互前后的偏移/漂移。可通过回录测量时建议绝对偏移不超过 80ms、首尾漂移不超过一源帧；无法测量必须标为人工观察，不宣称数值通过。

测试至少三轮切源及退出回收、快速连续 seek、暂停中倍速/换轨、全屏/显示切换、字幕弹幕叠加。性能不承诺既有估算降幅；明显退化时定位，不能通过保留 Canvas 自动回退掩盖。最终验收展示已测与未测边界，由用户签核。

## 风险与权衡

- 非标准接口随 Chromium 升级存在变动风险，升级回归 presenter；不为假设风险维护第二套渲染。
- video 内部队列可能增加显示延迟，时钟正确不等于口型同步；不能用固定补偿猜测覆盖所有倍速和设备。
- 软解可播放不等于软解 HDR/长播放均已验证；该差异进入验收而非重复可行性阻塞。
- 重建轨道可能短暂黑帧、旧 play Promise 拒绝、首帧回调竞态；通过代次、有界等待和正式入口测试处理。
- 删除 Canvas 限制兼容内核的非 Chromium 扩展，但符合当前产品支持范围；原生内核继续可用。
