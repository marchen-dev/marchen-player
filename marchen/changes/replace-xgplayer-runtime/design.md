## 背景

现有播放链分成两部分，但边界仍然混杂：

- `packages/player-core` 已经把导入、hash、匹配、弹幕加载抽成 RxJS 状态机，但状态继续从 `ready` 进入 `playing`，并通过 `PlayerBridge` 直接调用 Renderer 中的播放器。
- Renderer 的 `useXgPlayer` 创建全局 xgplayer 实例，`Event.tsx` 监听 xgplayer 事件完成进度、已看、截图、上下集和全屏，字幕则从 xgplayer 的 `media` 属性取得 video。
- 设置 Sheet 通过 `.xgplayer` 查询 Portal 容器，自定义退出、全屏、设置、上下集插件与 xgplayer 插件基类和 CSS 强耦合。
- Web 与 Electron 共享 Renderer，但全屏、文件路径、播放列表、内嵌字幕和截图能力通过多处 `isWeb` 条件分散表达。
- Web 导入器会创建 Object URL，目前没有明确的换片与销毁回收契约。

本设计将“准备可播放数据”“媒体播放状态”“DOM 弹幕”“字幕”和“React UI”拆成可独立测试和替换的层。浏览器原生 video 仍是唯一视频画面，因此 Electron 与 Web 可以继续共享 React 控件、DOM 弹幕和 libass 字幕。FFmpeg 媒体兼容后端将来只需实现新的媒体来源/后端 Port，不要求再次重写 UI。

## 目标与非目标

**目标：**

- 完全移除 xgplayer 和 danmu.js 的运行时、类型、插件、样式与 DOM 约定。
- 让加载状态机停在 `ready`，播放状态由独立 PlaybackSession 管理。
- 以原生 `HTMLVideoElement` 实现当前浏览器可播放格式的完整播放生命周期。
- 自研 DOM 弹幕引擎，支持现有弹幕设置、播放同步、热更新和高密度保护。
- 保留 libass-wasm，并把字幕生命周期改为直接依赖 video 元素和字幕 Port。
- 实现 IINA 风格的沉浸式、响应式、桌面可拖动控制栏。
- 用 capabilities 和 ports 组合 Electron/Web 能力，使共享 UI 不直接依赖 Electron IPC。
- 保持进度、已看、续播、播放列表、自动下一集、截图和设置持久化行为。
- 通过单元测试、Electron/Web 构建及真实界面验收证明迁移完成。

**非目标：**

- 不实现 FFmpeg 流媒体、MSE、转封装或转码。
- 不承诺 EAC3、HEVC、HDR、4K60 等 Chromium 原生能力之外的格式。
- 不实现自研 demux、解码器、音频输出或音画同步。
- 不引入 mpv、VLC、GStreamer 或独立原生播放窗口。
- 不实现 PiP、投屏、章节和多音轨选择。
- 不把弹幕改成 Canvas/WebGL，也不把逐帧动画放进 React 或 RxJS。
- 不迁移整个仓库到 `apps/*`，不改影视库的数据模型。
- 不让 Web 上传本地视频，也不以 FFmpeg WASM 作为默认降级。

## 决策

### 1. 三个 workspace 包对应三个稳定领域

```text
packages/player-loading/       读取并准备内容
packages/playback-core/        管理媒体播放会话
packages/danmaku-engine/       管理弹幕时间轴和 DOM
```

#### `@marchen/player-loading`

现有 `@marchen/player-core` 原目录和 package name 一并重命名。它继续负责导入、hash、弹弹play 匹配、弹幕缓存、手动匹配、本地弹幕和历史基础数据。

状态机改为：

```text
idle → importing → hashing → matching
                              ├→ waiting_user
                              └→ loading_danmaku → ready

ready → reloading → ready
任何加载阶段 → error
任何阶段 → idle（cancel）
```

`ready` 是稳定状态而不是 100ms 的过渡状态。它持有 `video`、`match`、`danmaku` 和 `mergedComments`，直到换片或 cancel。删除 `PlayingState`、`playing` 事件、`PlayerBridge`、`connectPlayer/disconnectPlayer`；重新匹配和本地弹幕修改只更新 ready 数据。

#### `@marchen/playback-core`

纯 TypeScript + RxJS 包，不 import DOM、React、Electron、Dexie 或 libass。主要契约：

```ts
type PlaybackState =
  | { status: 'idle' }
  | { status: 'loading'; source: PlaybackSource }
  | { status: 'ready'; duration: number; currentTime: number }
  | { status: 'playing'; duration: number; currentTime: number; rate: number }
  | { status: 'paused'; duration: number; currentTime: number; rate: number }
  | { status: 'seeking'; duration: number; targetTime: number; resumeAfterSeek: boolean }
  | { status: 'ended'; duration: number }
  | { status: 'error'; error: PlaybackError }
```

`PlaybackSession` 接收 `MediaPort` 的事件，公开只读 state stream 与 play/pause/seek/setVolume/setMuted/setRate/load/destroy 命令。新 source 使用 switch semantics 替换旧会话；destroy 后任何迟到事件都被忽略。

RxJS 用于媒体事件归一化、会话取消、状态折叠和低频观察者编排。进度条的逐帧视觉插值和弹幕动画不进入 state stream；播放时 UI 与弹幕通过只读媒体时钟取得高精度 `currentTime`。

#### `@marchen/danmaku-engine`

浏览器 DOM 包，不依赖 React。它接收标准化 `DanmakuItem[]` 和 `DanmakuClock`，不解析弹弹play的 `p` 字符串。API/Renderer adapter 将原始评论转换为：

```ts
interface DanmakuItem {
  id: string | number
  time: number
  text: string
  mode: 'scroll' | 'top' | 'bottom'
  color: string
}
```

包内部按 scheduler、lane allocator、collision、DOM pool、renderer 分层。时间索引、轨道分配和碰撞尽量保持纯函数，以便不依赖浏览器环境做单元测试。

### 2. Renderer 的 PlayerRuntime 组合 DOM 控制器与平台 Port

`src/renderer/src/services/player-runtime` 是应用组合层：

```text
PreparedVideo ───────────────┐
                            ▼
                     PlayerRuntime
                     ├ PlaybackSession
HTMLVideoElement ──▶ HtmlVideoMediaAdapter
DanmakuSurface ────▶ DanmakuEngine
SubtitleSurface ───▶ LibassSubtitleAdapter
                     ├ PlaybackHistoryAdapter
                     ├ FullscreenPort
                     └ PlayerCapabilities
```

React 在 surfaces 的 DOM ref 就绪后创建 runtime，通过 Context 暴露稳定的 view model 和 commands，而不是暴露 HTMLVideoElement 或第三方播放器实例。具体组件不直接调用 IPC、Dexie 或弹幕引擎。

运行时销毁顺序固定为：停止 UI frame loop → 销毁弹幕 → 销毁字幕 → 取消观察者 → 销毁 PlaybackSession → 释放当前 source。换片使用同一顺序，防止旧监听更新新视频。

### 3. `HtmlVideoMediaAdapter` 是第一阶段唯一媒体后端

Adapter 持有一个明确注入的 `HTMLVideoElement`，把 DOM 媒体事件映射到 playback-core 的 `MediaEvent`，并实现命令：

- 设置/清除 `src`、`load()`。
- `play()` 并区分 autoplay rejection 与媒体错误。
- pause、seek、volume、muted、playbackRate。
- 提供 `currentTime`、duration、buffered 的只读快照。

第一阶段 Electron 与 Web 都使用这个 adapter。未来 FFmpeg change 可以提供可被同一 video 消费的 URL/MSE source，或者新增兼容后端，但 PlaybackSession 与 UI 契约不变。

### 4. 能力对象决定平台功能，Port 承担副作用

```ts
interface PlayerCapabilities {
  platform: 'electron' | 'web'
  directoryPlaylist: boolean
  embeddedSubtitle: boolean
  externalSubtitle: boolean
  snapshot: boolean
  ffmpegPlayback: boolean
  windowFullscreen: boolean
  domFullscreen: boolean
}
```

`createWebPlayerPorts` 提供 Browser Fullscreen API、File/Blob 来源和用户选择的外挂字幕；不提供目录、内嵌字幕、截图与 FFmpeg。

`createElectronPlayerPorts` 复用现有 IPC 文件导入、目录列表、BrowserWindow 全屏、字幕提取和截图。全屏 adapter 同时消费 main 进程 enter/leave-full-screen 事件，确保用户按 Escape 或系统改变窗口状态时 Renderer 能同步，而不是根据点击按钮乐观猜测。

UI 接收 capabilities 决定操作：Electron 有播放列表时显示上一集/下一集；Web 单文件显示 ±10 秒。缺失能力不生成会误导用户的入口。

### 5. 播放页面使用固定覆盖的 `PlayerShell`

无视频、加载、等待匹配时继续使用现有 RootLayout、AppHeader 和 Sidebar。ready 后，PlayerPage 渲染 `data-player-active` 的 fixed PlayerShell 覆盖整个窗口，RootLayout 用既有 `:has()` 模式隐藏普通 AppHeader/Sidebar。

```text
PlayerRoot
├── PlayerWindowChrome       z-40（Electron 窗口态）
├── VideoSurface             z-0
├── SubtitleSurface          z-10
├── DanmakuSurface           z-20
├── InteractionSurface       z-30
├── FloatingController       z-40
└── PlayerPortalRoot         浮层容器
```

Electron 的 PlayerWindowChrome 提供 macOS 红绿灯安全区、drag region 和左对齐标题；窗口全屏时隐藏。Web 不显示原生窗口 chrome，只在唤起控制器时按需显示轻量标题信息。

Web Fullscreen API 请求整个 PlayerRoot。`PlayerPortalRoot` 位于 PlayerRoot 内，所有播放器 Sheet、Popover、Dropdown 和 Tooltip 通过 `PlayerPortalContext` 选择该容器，移除 `.xgplayer` 查询和默认 `document.body` 假设。

### 6. IINA 控制器是播放器自研组件，Radix 只提供 primitives

桌面控制器是双行悬浮面板：第一行左侧音量、中间 transport、右侧弹幕/字幕/播放列表/设置/全屏；第二行是当前时间、时间轴和总时长。倍速、旋转和其他低频功能进入 More/Inspector。控制器隐藏时可按现有设置显示底部迷你进度。

播放器自己实现 PlayerShell、FloatingController、PlayerIconButton、TimelineScrubber、拖动、自动隐藏和 PlayerInspector 视觉。现有 shadcn/Radix 包装继续承担 Tooltip、Popover、DropdownMenu、Sheet/Drawer、Dialog、Select、Switch、Toggle 等通用交互；普通 Slider 可用于音量，但时间轴必须自研以表达 buffered、扩大命中区、拖动预览和媒体 seek。

视觉 token 作用域限定在 `[data-player-root]`：`--player-surface`、`--player-fg`、`--player-fg-muted`、`--player-border`、`--player-shadow`、`--player-focus` 等。视频底色固定为中性黑；控制器采用足够深的半透明材质、有限 blur、边框和阴影。减少透明度或性能不足时回退为不透明表面，不修改 library/sidebar 全局 token。

### 7. 控制器拖动使用 Framer Motion，位置以比例保存

不增加拖拽依赖，复用现有 `useDragControls`、零弹性、零惯性和 constraints 模式。控制器只有专用 handle 与明确空白区触发 drag，交互控件标记为非拖动区域。

保存值是相对 safe rect 的 `{ xRatio, yRatio }`，而不是 transform 像素。拖动结束后 clamp 并持久化；resize、窗口全屏变化或控制器尺寸变化时重新投影和约束。桌面默认锚点约为画面宽 50%、高 72%；手机布局忽略保存值但不删除它。

为满足非拖动替代操作，handle 可聚焦并支持方向键 8px、Shift+方向键 32px、Home 重置；设置中提供上方、默认、下方和重置预设。拖动期间自动隐藏计时暂停，控制器移动后向弹幕引擎更新遮挡矩形。

### 8. 控件显隐采用独立 UI 状态机

控制器显隐不是 PlaybackState 的一部分，Renderer 内以输入活动、播放状态、drag/seeking/focus/panel/error 条件计算：

```text
visible
  └─ playing + idle timeout + 无阻塞条件 → hidden
hidden
  └─ pointer/touch/key/focus/pause/error → visible
```

打开设置、Popover 或拖动时获取 visibility lock，关闭后释放并重新计时。Touch 首次点击只唤起控制器，已经可见时才执行画面单击播放暂停，避免移动端误操作。快捷键处理忽略 input、textarea、select、contenteditable 和打开的模态交互。

### 9. DOM 弹幕以媒体时钟为真相源

引擎维护按时间排序的数组和当前索引。播放时只运行一个 rAF loop，从 `DanmakuClock.now()` 读取时间并调度进入 look-ahead window 的项目；暂停停止动画，seek 清空在屏项目并二分定位新索引，倍速改变更新运动速率或基于剩余距离重建动画。

滚动轨道根据前一弹幕宽度、速度、进入时间和剩余距离判断是否可安全复用；顶部/底部弹幕占用固定时长。没有安全轨道或达到最大节点数时按策略丢弃，不扩张 DOM。节点结束后复位 class、style、事件和文本再归还 pool。

ResizeObserver 只触发节流后的轨道重算。设置变化走 engine command，数据重新匹配走 `replaceItems(items, currentTime)`，不重建视频会话。hover pause 只对弹幕节点启用 pointer events；关闭该能力时 DanmakuSurface 不截获画面点击。

控制器可见时把其 client rect 转换为 DanmakuSurface 坐标作为 exclusion rect。固定弹幕不得新分配到遮挡区域；滚动弹幕允许从其后经过，但控制器层保持更高 z-index。

### 10. libass 字幕由专用 Controller 管理

`LibassSubtitleAdapter` 接收 video、worker URL、字体和字幕来源，负责创建、换轨、freeTrack、timeOffset、resize 和 dispose。它不读取 Player Context，也不处理 IPC。

`SubtitleCatalogPort` 负责列出/解析字幕：Electron adapter 提供内嵌流、同目录匹配和格式转换；Web adapter 只接受用户提供的 ASS/SSA Object URL。选择策略保留历史默认值优先、中文轨道其次、首个轨道兜底。提取或转换错误以可恢复错误呈现，不进入 PlaybackSession error。

字幕 Object URL 和 libass worker/画布必须在换片和销毁时释放。字幕记录继续写现有 HISTORY `subtitles` 字段，不做 schema 迁移。

### 11. 持久化通过观察者适配，不写进播放核心

`PlaybackHistoryAdapter` 订阅播放会话低频事件：

- metadata 后恢复有效进度；已完成记录从 0 开始。
- 播放期间按约 2 秒节流更新 progress/duration。
- 超过 90% 或 ended 时更新 library 已看状态。
- ended 后若 Electron 播放列表存在下一集且设置开启，通过 player-loading 的统一入口换片。
- Electron metadata/退出时请求截图，失败只记录错误。

字幕默认值、偏移和控制器位置继续由现有 Dexie/Jotai 设置体系保存。拖动中的瞬时坐标留在组件/MotionValue，只在 drag end 写设置，避免持续触发 React 与 localStorage。

### 12. Web source 明确拥有释放权

VideoImporter 返回的 source 除 URL 外增加生命周期语义，或由 Web adapter 维护当前 Object URL。只有创建该 URL 的 adapter 可以撤销它；新 source 激活或 runtime destroy 后撤销旧 URL。hash 失败时也必须撤销已创建 URL。

媒体 `NotSupportedError`、`MEDIA_ERR_SRC_NOT_SUPPORTED` 或 decode error 映射成兼容性错误。Web 错误界面说明浏览器限制并提供桌面客户端下载入口，不把普通网络/读取错误错误标注为编码问题。

### 13. 采用并行建设、最后切换的迁移顺序

新 workspace 包和 PlayerRuntime 在旧 xgplayer 路径旁建设并独立测试；在原生播放、控制 UI、字幕、弹幕和持久化接回后，PlayerPage 一次切换到新入口。切换通过验证后再删除旧 hooks、Context、plugins、CSS、依赖和文档引用。

不设置长期双运行时 feature flag，避免两套播放器继续演化。开发期间可保留内部临时入口用于视觉比较，但最终产物只能存在新运行时。

## 风险与权衡

### 改动面大，功能回归风险高

播放事件、字幕、弹幕、全屏和持久化过去都绑定同一 xgplayer 实例。分包后遗漏任一观察者都可能表现为“能播放但历史/字幕失效”。通过功能矩阵、分阶段切换和 Electron/Web 双端验收降低风险；旧实现必须等新链路覆盖后再删除。

### 两个状态机可能职责重叠

player-loading 只描述准备数据，playback-core 只描述当前媒体会话。`ready` 不等于 video 正在播放，PlaybackState 也不包含匹配/弹幕请求。Renderer PlayerRuntime 是唯一交接点，禁止任一包反向 import 另一个包的具体 service。

### RxJS 过度进入高频路径

如果把 currentTime 每帧写入 BehaviorSubject，会增加分配和 React 更新。设计限定 RxJS 处理离散媒体事件和低频状态；时间轴插值、弹幕和 MotionValue 使用单独 frame loop，并在暂停/隐藏时停止。

### DOM 弹幕高密度性能

DOM 便于样式、hover 和调试，但节点过多会触发布局与绘制开销。必须先设最大在屏量、节点池和丢弃策略，再用真实高密度样本测量。若达不到目标，优先减少阴影复杂度、批量读取尺寸、限制节点数，而不是在本变更改用 Canvas。

### 可拖动控制器与控件手势冲突

整面板监听拖动会抢占 Slider 和按钮。只允许 handle/空白区启动 drag，并对交互区明确禁用；拖动必须有键盘与预设位置替代。手机空间不足，固定 Dock 是有意的能力差异。

### 透明材质在复杂画面上对比不足

单纯依赖 backdrop blur 会在高亮画面上失去可读性，也可能增加 GPU 开销。使用深色基底、边框与阴影保证合成后的对比，并提供不透明与 reduced motion/透明度回退。

### Fullscreen Portal 与全局浮层冲突

Radix 默认 Portal 到 body，在 Web fullscreen 中会不可见。播放器浮层必须使用 PlayerPortalRoot；应用级 Toast/Modal 仍保留 body。验收需要覆盖控制器被拖到各边缘后打开 Popover/Sheet 的定位与 focus trap。

### libass 和 Object URL 泄漏

字幕 worker、canvas、轨道 URL 与 Web 视频 URL 都有独立生命周期。PlayerRuntime 采用确定销毁顺序，并为连续换片、失败导入、退出页面建立回归测试或运行时验收。

### 浏览器格式差异无法在本变更解决

原生 video 在不同操作系统上对 HEVC 等能力不同。本变更只负责正确识别和展示失败，不承诺统一解码。后续 FFmpeg change 必须复用这里定义的 runtime/Port，而不是把平台判断重新塞回 UI。
