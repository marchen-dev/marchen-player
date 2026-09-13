## 动机

当前播放器依赖 `@suemor/xgplayer` 统一管理原生 video、控制栏、事件、全屏和插件，弹幕又依赖 `danmu.js`。Renderer 因此直接耦合 xgplayer 实例、事件名、配置、CSS、插件 DOM 和 `.xgplayer` 选择器；字幕、进度持久化、播放列表以及 Electron 全屏也都围绕这套实例展开。继续沿用该结构会限制播放器 UI 的彻底重构，也难以让 Electron 与 Web 在共享界面的同时清晰表达各自能力。

项目已经完成依赖栈升级和播放器加载状态机抽取，现在适合把“视频导入与弹幕匹配”和“实际播放运行时”彻底分开。本变更建立由 Marchen 自己掌控的播放器运行时，以原生 `HTMLVideoElement`、自研 DOM 弹幕和保留的 `@jellyfin/libass-wasm` 作为长期基础，并将控制栏改为 IINA 风格的可拖动悬浮界面。

本变更只完成浏览器原生可播放格式的运行时替换。FFmpeg、MSE、EAC3、HEVC 兼容播放属于后续独立变更，避免把 UI/运行时迁移与媒体转码后端一次性交付。

## 变更内容

- 移除 `@suemor/xgplayer`、`danmu.js`、xgplayer 插件、样式和实例上下文，改用 Marchen 自己的播放器运行时。
- 将现有 `@marchen/player-core` 重命名为 `@marchen/player-loading`，状态在弹幕与匹配数据准备完成后停留于 `ready`；删除 `PlayingState`、人为 `ready → playing` 延迟和 `PlayerBridge`。
- 新增纯 TypeScript + RxJS 的 `@marchen/playback-core`，统一播放状态、命令、媒体事件和能力契约；RxJS 只负责异步编排，不驱动逐帧动画。
- 新增无 React 依赖的 `@marchen/danmaku-engine`，以 DOM 实现滚动、顶部、底部弹幕、轨道分配、碰撞检测、节点池、高密度降级以及播放时钟同步。
- 保留 libass-wasm，并将字幕控制器改为直接绑定 `HTMLVideoElement`；继续支持 Electron 内嵌字幕、同目录字幕与外挂字幕，Web 支持用户选择外挂 ASS/SSA。
- 重写播放器页面为沉浸式 `PlayerShell`。无视频和加载阶段保留现有 AppShell；开始播放后隐藏 Sidebar 和普通 AppHeader，渲染平台适配的窗口标题层、视频/字幕/弹幕表面和播放器浮层。
- 实现面向 Electron/Web 桌面端的 IINA 风格双行悬浮控制器。控制器可拖动并持久化归一化位置，提供键盘移动、预设位置和重置；本变更不要求手机、平板触控或移动端响应式适配。
- 采用“自研播放器组件 + shadcn/Radix primitives”的 UI 边界：播放器外壳、时间轴、拖动和自动隐藏自行实现，Tooltip、Popover、Sheet、Dialog、Select、Switch 等复用现有基础设施。
- 通过 `PlayerCapabilities` 和 Port 适配 Electron/Web 差异，统一处理全屏、文件来源、播放列表、字幕、截图等能力，避免组件内散落 `isWeb`。
- 恢复并验证现有播放功能：播放暂停、seek、音量、静音、倍速、续播、迷你进度、旋转、上下集、自动下一集、进度保存、已看标记、截图和错误上报。
- 修复 Web 本地 Object URL 生命周期；遇到浏览器不支持的编码时显示明确兼容提示，不上传本地视频，也不默认引入 FFmpeg WASM。

## 能力

### 新增能力

- `native-playback-runtime`：基于原生 video 的播放会话、命令、状态和媒体事件。
- `immersive-player-controls`：IINA 风格沉浸式播放器界面、紧凑的可拖动桌面控制栏、时间轴悬停预览、±5 秒跳转、快捷键和可访问交互。
- `dom-danmaku-engine`：独立 DOM 弹幕调度、碰撞、节点复用、时钟同步和设置热更新。
- `subtitle-playback`：围绕原生 video 的 libass 字幕生命周期及 Electron/Web 字幕能力。
- `platform-playback-adapters`：通过 capabilities 与 ports 提供 Electron/Web 文件、全屏、播放列表、截图和错误降级。

### 修改能力

- `player-loading-handoff`：加载状态机只准备视频、匹配和弹幕数据，不再拥有播放状态或直接操作播放器。
- `playback-persistence`：把进度、已看、续播、字幕记录、控制栏位置和 Electron 缩略图接入新运行时。

## 影响范围

- Workspace：重命名 `packages/player-core`，新增 `packages/playback-core` 与 `packages/danmaku-engine`，同步 package、tsconfig、Vite 和测试配置。
- Renderer：重写 `components/modules/player`、`services/player-loading` 的交接方式、播放器设置与 Portal；新增 PlayerRuntime、平台 adapter、沉浸式布局和播放器专属 token。
- Main/IPC：复用现有文件导入、目录播放列表、窗口全屏、字幕提取和截图接口，必要时补充明确的全屏状态事件契约；不新增 FFmpeg 流媒体接口。
- 数据：沿用现有 Dexie HISTORY schema；只调整读写适配和设置字段，不进行破坏性迁移。
- 依赖：删除 xgplayer 与 danmu.js；保留 RxJS、Framer Motion、Radix/shadcn、Mingcute 和 libass-wasm；不新增拖拽库。
- 文档与验收：更新播放器相关 README/AGENTS 描述，并分别验证 Electron 与 Web 桌面窗口的窗口态、全屏、控制器布局、字幕、弹幕和播放生命周期。
