## 背景

前三轮首页先后尝试了影院卡片、扁平舞台和统一分格，但都把本应简单的文件入口做成了内容页面。用户已明确要求回到类似旧版的极简结构，并删除历史播放信息。

## 目标与非目标

**目标：**

- 空态完整恢复截图所示的旧版图标、文案和点击区域。
- Electron 与 Web 使用同一视觉结构和各自已有的文件选择能力。
- 拖拽、格式校验、加载状态机和可访问性不退化，并在拖入时提供明确反馈。
- 首页不依赖 HISTORY、library 或转码临时播放源。

**非目标：**

- 不在首页展示继续观看、最近播放、封面、关键帧、进度或影视库入口。
- 不重做 AppHeader、Electron Sidebar、设置面板或实际播放器。
- 不修改影视库到播放器的历史加载链路。
- 不处理 FFmpeg 转码实现、持久化 schema 或逻辑时间线。

## 决策

### 1. 单一内容结构

不再保留独立 `PlayerHome` 组件，恢复 `VideoPlayer` 内联的 `DragTips`：

```text
VideoPlayer
└── VideoProvider
    └── VideoDropZone
        ├── DragTips
        │   ├── 线框播放图标
        │   └── 「点击或拖拽动漫到此处播放」
        └── VideoDropOverlay（仅拖入期间）
```

删除首页专用的 PlayerHome、ImportCard、ResumeHero、RecentGrid、历史数据 hook、平台过滤、选择器和 scoped 首页 CSS。拖拽覆盖层不再属于首页，而是与状态管理一起放在 `components/modules/shared/VideoDropZone.tsx`，供播放器与影视库复用。`loadHistoricalVideo` 仍由影视库跳转 hook 使用，不因首页删除历史而回退或改写。

### 2. 视觉语言

- 使用旧版 `text-gray-500`、`text-6xl` 图标、`text-xl` 文案和 `gap-2 p-12` 间距。
- 整个提示块响应点击，hover 使用旧版 1.04 缩放、按下回到 1。
- 不增加按钮底色、圆角、边框、阴影、格式说明或其他文案。

此处以用户提供的原版截图为唯一视觉基准，不再对旧版空态进行二次设计。

### 3. 通用视频拖拽区域

`VideoDropZone` 使用真实 div 包裹目标页面，负责：

- 只响应 `dataTransfer.types` 包含 `Files` 的拖拽；
- 用进入深度计数避免在子节点间移动时反复闪烁；
- 在 drop、真正离开区域、禁用或卸载时清理状态；
- drop 时只把首个 File 交给调用方，不负责格式判断或导航；
- 仅拖入期间渲染 `VideoDropOverlay`，覆盖层 `pointer-events: none`。

覆盖层使用全局语义色、细虚线边框、Mingcute 下载图标和“释放以打开视频”，不显示格式说明。它不改变播放器原版常驻空态，也不复制影视库的卡片视觉。

播放器把收到的 File 交给现有 `loadFromFile`；影视库先进行相同格式校验，通过后导航到 `/player` 并调用同一 service。详情弹层打开时禁用影视库 drop zone，避免覆盖模态交互。

### 4. 平台与播放边界

- Electron 点击按钮继续调用 `ipcClient.player.importAnime()` 后 `service.loadFromPath(path)`。
- Web 点击按钮继续触发隐藏的 `input[type=file]`，选择后调用 `service.loadFromFile(file)`。
- drop 与 change 共用现有 MP4/MKV 校验及错误 toast。
- 首页不读取 hash/path/progress/duration，也不接触 localhost 转码 URL 或 FFmpeg session；转码任务可在 `loadFromPath` 之后独立演进。

### 5. 验证策略

- 源码回归确认 idle 分支恢复内联 `DragTips`，且没有 HISTORY、resume、recent 或 library 依赖。
- 验证 idle 时只显示原版图标与文案，开始加载后仍由 Timeline/Player 接管。
- Electron 与 Web 分别验证点击选择、播放器拖拽覆盖层、影视库拖拽覆盖层和格式错误；浅色与夜间均保存截图。
- 定向运行 Vitest、typecheck 和本次文件 ESLint。

## 风险与权衡

### 发现性降低

原版文案同时表达点击和拖拽，发现性足够；不再追加格式与功能说明。

### 历史便捷入口移除

播放器首页不再提供一步续播，但影视库仍保留历史内容和现有跳转链路。职责更单一，也避免与转码需求正在调整的持久化/临时播放源边界发生耦合。
