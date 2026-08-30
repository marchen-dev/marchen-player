---
format: 1
title: 重写播放器运行时、沉浸式 UI 与媒体兼容层
summary: >-
  移除 xgplayer 与 danmu.js，以原生视频、DOM 弹幕和 libass 重建 Electron/Web 共用播放器，并将 FFmpeg
  兼容后端拆为第二个变更。
tags:
  - player
  - architecture
  - ui
  - web
  - danmaku
  - electron
  - ffmpeg
  - rxjs
createdAt: '2026-08-29T12:05:23.181Z'
updatedAt: '2026-08-29T12:14:31.408Z'
---

> 本文记录尚未定案的探索背景；晋升后以正式变更产物为准。

## 背景与价值

当前播放器由 xgplayer 统一承担 HTMLVideoElement 生命周期、控制 UI、事件、全屏、自定义插件和弹幕接入，组件还直接依赖其实例、事件、配置、CSS 和 DOM 选择器。这妨碍播放器 UI 的彻底重构，也让 Electron 与 Web 的共用边界、后续 EAC3/HEVC 兼容能力难以独立演进。

目标是建立由 Marchen 自己掌控的播放器运行时：原生 video 作为近期默认画面，自研 DOM 弹幕，保留 libass-wasm，并通过能力与 Port 隔离 Electron/Web。整体保留为一个方向，但正式实施拆成两个独立变更，避免一次交付 UI、运行时替换和完整 FFmpeg 后端。

## 已确认

### 正式变更拆分

1. **共享播放器运行时与 UI**
   - 原生 HTMLVideoElement、自研 DOM 弹幕、保留 @jellyfin/libass-wasm。
   - Electron/Web 共用播放器 UI 与运行时。
   - 删除 @suemor/xgplayer、danmu.js 及相关插件和 DOM 耦合。
   - 先完成双端原生可播放格式的主要功能对等。

2. **Electron 媒体兼容后端**
   - ffprobe 探测、现代 FFmpeg runtime、localhost 媒体服务及 fMP4/MSE 或等价方案。
   - EAC3 音频转换和 HEVC 不可原生播放时的兼容策略。
   - 在第一个变更验收后独立设计、实现和验收。

暂定 change 名为 replace-xgplayer-runtime 和 add-ffmpeg-compat-playback，propose 时可再确认。

### 技术边界

- 不再使用或升级 xgplayer，也不先迁移到其上游版本。
- 不把 danmu.js 作为长期依赖；可参考其 MIT 源码中的轨道调度、碰撞和 DOM 回收思路。
- 弹幕默认使用 DOM，不切换 Canvas。
- 保留 libass-wasm 处理 ASS/SSA。
- 不自行实现 HEVC 解码器、音画同步器或完整原生播放内核。
- 不使用 mpv 独立窗口承载播放器 UI。
- RxJS 只用于加载、播放状态与跨模块异步编排，不驱动逐帧弹幕动画和 DOM 样式。
- Electron 与 Web 继续共用 Renderer，平台差异通过 capabilities 和 ports 隔离，避免组件中散落 isWeb。
- 保留根应用结构，本次不迁移为 apps/desktop 与 apps/web。

## 当前架构倾向

- 将 @marchen/player-core 改名为 @marchen/player-loading，只负责导入、hash、匹配、弹幕加载和缓存，并在 ready 结束。
- 新建纯 TypeScript 的 @marchen/playback-core，负责播放状态、命令、事件、时间轴和能力编排，不直接依赖 React、DOM、Electron 或 FFmpeg。
- 新建无 React 依赖的 @marchen/danmaku-engine；React 只挂载容器，引擎命令式管理 DOM。
- 删除加载核心中的 PlayerBridge，Renderer 消费 mergedComments 后交给播放运行时。
- 时间轴查找、轨道调度、碰撞、DOM Pool 和动画使用普通 TypeScript、WAAPI、CSS 或 requestAnimationFrame。

播放器根节点明确分层：

~~~text
PlayerRoot
├── VideoSurface                 z-0
├── SubtitleSurface              z-10
├── DanmakuSurface               z-20
├── InteractionSurface           z-30
├── TopControls/BottomControls   z-40
└── PlayerPortalRoot
~~~

PlayerPortalRoot 必须位于进入 Fullscreen API 的元素内部，保证 Web 全屏时 Sheet、Popover、Tooltip 可见。当前 SettingSheet 查询 .xgplayer 的方式必须替换为显式的播放器 portal/container 上下文。全屏目标是整个 PlayerRoot，不是 video 元素。

## UI 与响应式方向

- 无视频时保留正常 AppShell：AppHeader + Sidebar 用于导入、导航和设置。
- 播放时切换成全幅沉浸式 PlayerShell：隐藏 Sidebar，AppHeader 不占布局高度，转为透明顶层控件。
- Electron 窗口态保留 macOS traffic light 安全区与拖拽区域；Web 不保留平台留白。
- 视频区始终使用中性深色/黑色背景，控件采用顶部/底部渐隐遮罩与白色层级。
- 保留 Manrope 与 Mingcute；不引入另一套通用字体或整套“红色 OLED”视觉系统。
- 使用作用域内 --player-* token，不全局重染资料库和侧边栏；播放器强调色待确认。
- >= 1024px 使用完整桌面控件；640–1023px 使用紧凑控件，次要功能收入“更多”；< 640px 中央显示后退 10 秒/播放/前进 10 秒，底部保留时间轴、时间、静音、弹幕、字幕、更多、全屏，设置改用底部 Drawer。
- 使用 100dvh、safe-area inset 和至少 44×44 px 的触控目标。
- 触屏不依赖 hover，首次点击显示控件。
- 控件仅在“正在播放且用户空闲”时隐藏；暂停、拖动、键盘焦点、设置打开和错误状态保持可见。
- 原生 button 提供 aria label/state 与可见焦点，尊重 prefers-reduced-motion。
- 支持 Space/K、方向键、M、F、ESC；输入或面板交互时不抢快捷键。
- 进度条点击热区大于视觉线条。

## 第一阶段功能范围

### DOM 弹幕

覆盖滚动、顶部、底部、颜色、字号、描边、持续时间、显示区域、显示隐藏、播放暂停、倍速、seek、resize、数据热更新、hover 暂停、DOM Pool、轨道碰撞、容量上限和丢弃策略。用真实高密度弹幕建立性能基线和降级阈值。

### 播放器功能对等

覆盖播放暂停、seek、音量、静音、倍速、自动播放、续播、上下集、自动下一集、单击/双击、全屏/退出、ESC、小进度条、旋转、错误提示、进度保存、已看状态、外挂字幕和 libass。截图、目录播放列表和内嵌字幕只在 Electron 能力可用时启用。

## Electron/Web 能力适配

~~~ts
interface PlayerCapabilities {
  platform: 'electron' | 'web'
  openFile: boolean
  directoryPlaylist: boolean
  embeddedSubtitle: boolean
  externalSubtitle: boolean
  snapshot: boolean
  ffmpegPlayback: boolean
  windowFullscreen: boolean
  domFullscreen: boolean
}
~~~

- createWebPlayerPorts：File/Blob URL、Browser Fullscreen API、外挂字幕文件、浏览器原生解码。
- createElectronPlayerPorts：marchen://、IPC 文件选择、BrowserWindow 全屏、嵌入字幕提取、截图、目录播放列表，后续接入 FFmpeg。
- Electron Window Fullscreen 与 Web DOM Fullscreen 使用独立 adapter。Web 监听 fullscreenchange，ESC 后同步浏览器状态。
- Web importer 的 object URL 在换片和销毁时必须 URL.revokeObjectURL。

共同能力：文件选择/拖拽、播放控制、DOM 弹幕、弹弹play 匹配、外挂 ASS/SSA、DOM 全屏。

Electron 专属：MKV 内嵌字幕提取、目录播放列表/自动下一集、截图、FFmpeg EAC3/HEVC 兼容、BrowserWindow 全屏。

Web 历史可保存元数据和进度，但刷新后不能自动重开本地 Blob。浏览器遇到不支持编码时展示明确兼容错误与桌面版入口；不默认上传本地视频，也不以 FFmpeg WASM 作为首选方案。

## 第二阶段媒体兼容方向

以 PlaybackPlan 选择 native、remux、transcode-audio 或 transcode-all。原生优先，EAC3 优先只转兼容音频，HEVC 原生不可用时再考虑 FFmpeg 软件解码后编码成 Chromium 可播放流。传输倾向 localhost + fMP4/MSE，但协议、缓存、seek、取消和安全边界须在第二个 change 单独设计。

## 已否决

- 继续深化或升级 xgplayer。
- 长期保留 danmu.js。
- Canvas/WebGL 作为首版弹幕默认实现。
- RxJS 或 React state 驱动每帧/每条弹幕动画。
- mpv 独立窗口。
- 本次顺带迁移整个仓库到 apps/*。
- 自研 demux、解码、音频输出和音画同步全栈。
- 一个正式 change 同时交付播放器/UI 重写与完整 FFmpeg 兼容后端。
- Web 默认上传视频或让 FFmpeg WASM 承担全部软解。

## 待确认

- 三个 workspace 包的最终名称，以及重命名兼容入口。
- DOM 弹幕的 WAAPI/CSS/rAF 组合、压测样本和性能阈值。
- 播放器强调色与桌面/平板/手机最终视觉稿。
- 旋转、小进度条和 hover 暂停是否全部进入第一阶段。
- 多音轨切换是否进入第一个 change。
- FFmpeg runtime 的分发、许可、架构、更新和硬件编解码策略。
- localhost 协议、缓存、seek、进程清理和安全边界。
- HDR、4K60 与高码率范围；验证前不承诺。
- MP4、MKV、ASS/SSA、EAC3、HEVC 和高密度弹幕验收样本。

## 相关代码入口

- src/renderer/src/styles/app-header.css
- src/renderer/src/components/modules/player/setting/Sheet.tsx
- src/renderer/src/services/player-loading/adapters/web-importer.ts
- src/renderer/src/router/router.tsx
- src/renderer/src/components/layout/
- src/renderer/src/components/ui/xgplayer/
- packages/player-core/

## 下次从这里继续

先从本 Idea 晋升 replace-xgplayer-runtime，完成包边界、能力接口、沉浸式响应式 UI、原生 video、DOM 弹幕、libass 和双端原生播放对等；独立验收通过后，再晋升 add-ffmpeg-compat-playback。

第一个 propose 前确认包名、第一阶段功能清单、播放器 token/响应式视觉约束及 DOM 弹幕压测基线。
