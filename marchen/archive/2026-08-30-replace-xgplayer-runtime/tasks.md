## 1. 建立迁移基线与功能矩阵

- [x] 1.1 盘点现有 xgplayer 配置、插件、事件监听、设置、字幕、弹幕和历史副作用，形成逐项迁移矩阵并标明 Electron/Web 能力
- [x] 1.2 准备合法的 MP4、MKV、ASS/SSA、内嵌字幕、本地弹幕和高密度弹幕验收样本，记录每个样本用于证明的场景
- [x] 1.3 记录当前 Electron/Web 的 typecheck、workspace 测试和构建基线，区分已有失败与本变更引入的失败

## 2. 收敛 player-loading 边界

- [x] 2.1 将 `packages/player-core`、package name、workspace 引用和 TypeScript alias 重命名为 `@marchen/player-loading`
- [x] 2.2 从加载类型和状态机删除 `PlayingState`、playing 事件及 `ready → playing` 延迟，使 ready 成为稳定终态
- [x] 2.3 删除 PlayerBridge、connect/disconnect 方法和 rematch pipeline 对播放器回调的依赖，改为只更新 ready 数据
- [x] 2.4 调整本地弹幕、弹幕源选择和重新匹配，使其在 ready/reloading 状态下工作并通过 state$ 发布新数据
- [x] 2.5 更新 player-loading 单元测试，覆盖正常 ready、弹幕失败降级、换片取消和 ready 状态热更新

## 3. 创建 playback-core

- [x] 3.1 创建 `@marchen/playback-core` workspace 包和公开类型，定义 PlaybackSource、PlaybackState、MediaEvent、MediaPort 与 PlaybackError
- [x] 3.2 实现 PlaybackSession 的 load、play、pause、seek、volume、mute、rate 和 destroy 命令及状态转换
- [x] 3.3 实现 source 替换与会话取消，确保旧 MediaPort 的迟到事件不能更新当前会话
- [x] 3.4 为 autoplay rejection、媒体错误、seek 恢复、ended 和销毁编写 playback-core 单元测试
- [x] 3.5 提供只读媒体时钟/快照接口，避免把逐帧 currentTime 写入 React 或 RxJS 状态

## 4. 建立原生 video adapter 与 PlayerRuntime

- [x] 4.1 实现 HtmlVideoMediaAdapter，将 HTMLMediaElement 事件和命令映射到 playback-core 契约
- [x] 4.2 实现 PlayerRuntime 的创建、换片和确定性销毁顺序，并通过 Context 暴露 view model 与 commands
- [x] 4.3 把 player-loading ready 数据转换为 PlaybackSource，并在 ready/换片/cancel 时创建或销毁 runtime
- [x] 4.4 实现 autoplay 被阻止、媒体不可播放和普通读取错误的分类与可恢复错误状态
- [x] 4.5 为 adapter 事件映射、runtime 换片和销毁后的迟到事件补充测试

## 5. 构建沉浸式 PlayerShell 与 Portal

- [x] 5.1 创建 PlayerShell 及 Video、Subtitle、Danmaku、Interaction surfaces，建立明确层级和中性黑视频背景
- [x] 5.2 让 ready 播放态以 fixed PlayerShell 覆盖 RootLayout，无视频/加载/等待匹配时继续使用普通 AppHeader 与 Sidebar
- [x] 5.3 创建 Electron PlayerWindowChrome，处理 macOS 红绿灯安全区、窗口拖动、左对齐标题和全屏隐藏
- [x] 5.4 创建 PlayerPortalRoot/Context，并让播放器 Sheet、Popover、Dropdown 与 Tooltip 使用该容器
- [x] 5.5 移除 SettingSheet 的 `.xgplayer` 查询并验证 Web DOM 全屏中的所有播放器浮层可见且可聚焦

## 6. 实现 IINA 风格控制器

- [x] 6.1 创建播放器专属 token、PlayerIconButton 和桌面双行 FloatingController，保持 Manrope 与 Mingcute 图标体系
- [x] 6.2 实现播放暂停、音量静音、倍速、当前时间、总时长和 capability 驱动的 transport/utility controls
- [x] 6.3 实现自研 TimelineScrubber，支持 buffered 展示、扩大命中区、拖动预览、seek 和拖动前播放状态恢复
- [x] 6.4 实现桌面可拖动控制器，限制拖动入口和安全边界，并在 drag end 持久化归一化位置
- [x] 6.5 实现拖动手柄的方向键、Shift 加速、Home 重置及位置预设，确保拖动不是唯一位置调整方式
- [x] 6.6 将桌面控制器收窄到约 520px，适当压缩高度和间距，并将音量轨道收窄到约 64px
- [x] 6.7 实现控制器显隐状态机、visibility lock、迷你进度和 reduced motion/透明度回退
- [x] 6.8 实现 Space/K、方向键、M、F、Escape 快捷键，并跳过输入控件和打开的面板
- [x] 6.9 将旋转、倍速和低频操作放入 More/PlayerInspector，接回弹幕、字幕、播放列表与退出播放入口
- [x] 6.10 按实机反馈将控制器收敛为 IINA 毛玻璃材质，并允许从非交互空白区域直接拖动
- [x] 6.11 按 Infuse 层级重排桌面控制器，只保留音量、居中传输、设置与全屏，并把播放器顶部改为关闭入口
- [x] 6.12 将音量与进度改为稳定的自研滑块，常显白色圆形滑块且拖动期间不闪烁
- [x] 6.13 统一播放器交互区域为系统默认箭头指针，并把默认指针约束写入仓库规范
- [x] 6.14 按 Infuse 实机比例将 macOS 关闭入口移到红绿灯下方，并收紧按钮尺寸与间距
- [x] 6.15 在时间轴鼠标悬停时显示目标 seek 时间，且悬停不修改已播放进度和滑块位置
- [x] 6.16 将前进/后退按钮、图标、可访问名称和方向键统一为 ±5 秒

## 7. 实现平台 capabilities 与全屏

- [x] 7.1 定义 PlayerCapabilities 及 Fullscreen、Playlist、Snapshot、SubtitleCatalog、SourceLifecycle ports
- [x] 7.2 组装 Web ports：File/Blob 来源、Browser Fullscreen API、外挂字幕和单文件 transport 能力
- [x] 7.3 组装 Electron ports：marchen 协议、IPC 文件选择、目录播放列表、BrowserWindow 全屏、字幕提取和截图
- [x] 7.4 补充 Electron enter/leave-full-screen 事件的 Renderer 同步，处理 Escape 或系统触发的外部状态变化
- [x] 7.5 根据 capabilities 隐藏不支持的功能，并验证 Web 不出现内嵌字幕、截图、窗口全屏和目录播放入口
- [x] 7.6 实现 Web 媒体不兼容提示和桌面版入口，确认不会上传视频或启动 FFmpeg WASM

## 8. 重构 Web source 生命周期

- [x] 8.1 为 Web 创建的 Object URL 建立明确所有者和 release 契约
- [x] 8.2 在 hash 失败、换片、退出播放器和 runtime 销毁时撤销旧视频 Object URL
- [x] 8.3 为连续 Web 换片、失败导入和销毁编写 URL 创建/撤销回归测试

## 9. 重构 libass 字幕

- [x] 9.1 创建 LibassSubtitleAdapter，直接绑定 HTMLVideoElement 并封装创建、换轨、关闭、偏移、resize 和 dispose
- [x] 9.2 创建 Electron SubtitleCatalog adapter，接回内嵌字幕探测/提取、同目录匹配和文本字幕转换
- [x] 9.3 创建 Web SubtitleCatalog adapter，支持用户导入 ASS/SSA 并管理字幕 Object URL
- [x] 9.4 迁移历史默认字幕、中文优先、字幕关闭、时间偏移和错误降级行为，不改变 HISTORY schema
- [x] 9.5 验证换片、连续切换字幕、全屏 resize 和退出时 worker、canvas、轨道与 Object URL 均被释放

## 10. 创建 DOM 弹幕引擎核心

- [x] 10.1 创建 `@marchen/danmaku-engine` workspace 包、标准 DanmakuItem 类型和弹弹play评论转换 adapter
- [x] 10.2 实现排序时间索引、look-ahead scheduler 和 seek 后二分重定位，并用纯函数测试边界时间
- [x] 10.3 实现滚动、顶部、底部轨道分配和滚动碰撞算法，覆盖不同播放器宽度、文本宽度和倍速场景
- [x] 10.4 实现最大在屏量、高密度丢弃策略和 DOM Pool，验证复用节点不会泄漏文本、样式与事件
- [x] 10.5 实现媒体时钟同步、播放暂停、倍速和 seek command，不通过 React state 逐帧驱动

## 11. 集成弹幕 DOM 与设置

- [x] 11.1 实现 DanmakuSurface renderer、单一 rAF loop、节点进入/退出和 ResizeObserver 节流重排
- [x] 11.2 接回字号、持续时间、显示区域、显示开关、hover 暂停和密度设置的运行时热更新
- [x] 11.3 订阅 player-loading ready 数据，在重新匹配、本地导入和弹幕源切换后从当前时间 replace items
- [x] 11.4 将可见控制器的矩形传给弹幕引擎，验证固定弹幕不进入遮挡区且拖动后约束同步更新
- [x] 11.5 用高密度真实样本记录在屏节点数、长任务和主观流畅度，根据结果收紧节点上限或样式成本
- [x] 11.6 确保 look-ahead 延迟期间节点已完成初始定位，消除左上角弹幕首帧闪现

## 12. 接回历史、播放列表与截图

- [x] 12.1 创建 PlaybackHistoryAdapter，恢复未完成进度并按约 2 秒节流保存 progress/duration
- [x] 12.2 在超过 90% 和 ended 时更新已看状态，已完成视频再次打开时从头播放
- [x] 12.3 接回 Electron 上一集、下一集和自动下一集，所有换片统一调用 player-loading 入口
- [x] 12.4 接回 metadata/退出截图并保证截图失败不阻塞播放、换片或退出
- [x] 12.5 扩展持久化播放器设置保存控制器位置，并验证桌面窗口 resize 与全屏切换后位置仍受安全边界约束

## 13. 切换入口并删除旧运行时

- [x] 13.1 将 PlayerPage 正式切换到 PlayerRuntime、PlayerShell 和新 Context，完成加载、匹配、播放、重新匹配与退出闭环
- [x] 13.2 删除 useXgPlayer、旧 Player Context、InitializeEvent/Subtitle、xgplayer config 和自定义 plugins
- [x] 13.3 删除旧 xgplayer/danmu 样式导入和选择器，确认仓库运行时代码不再引用 `.xgplayer`
- [x] 13.4 从 package 和 lockfile 删除 `@suemor/xgplayer`、`danmu.js`，确认未新增拖拽库
- [x] 13.5 更新 README、AGENTS/CLAUDE 播放器架构和支持能力说明，明确 FFmpeg 兼容属于后续变更

## 14. 验证与验收

- [x] 14.1 运行 player-loading、playback-core、danmaku-engine 单元测试及项目 typecheck，修复本变更引入的问题
- [x] 14.2 运行 Electron 与 Web 构建，验证 workspace package、libass worker 和静态资源均正确打包
- [x] 14.3 在 Electron 验证窗口态/全屏、拖动控制器、字幕、弹幕、播放列表、自动下一集、进度和截图
- [x] 14.4 在 Web 桌面宽度验证文件导入、原生播放、DOM 全屏、播放器 Portal、外挂字幕、弹幕和 Object URL 回收
- [x] 14.5 在 Electron 与 Web 桌面窗口验证紧凑控制器、时间轴悬停 seek 时间和 ±5 秒跳转
- [x] 14.6 验证键盘全流程、可见焦点、可访问名称、拖动替代操作、reduced motion 和错误公告
- [x] 14.7 全仓搜索确认 xgplayer/danmu.js 只允许出现在历史 changelog/archive 中，并完成最终功能矩阵复核
- [x] 14.8 复核播放器设置 Sheet 的局部主题，确保标题、字段、下拉值和来源按钮完整可读
- [x] 14.9 为 Infuse 控制层修订补充回归测试，并复核 Web 可见行为、Electron 能力分支及双端构建
