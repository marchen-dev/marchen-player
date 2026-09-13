## 背景

播放器控制层目前同时存在两条设置路径：

```text
PlayerControls
├── inspectorOpen（组件局部状态）
│   └── PlayerInspector：倍速、旋转、内容入口、退出播放
└── playerSettingSheetAtom（Jotai）
    └── SettingSheet：播放列表、弹幕、字幕 Accordion
```

`PlayerInspector` 进入具体内容时先关闭自身，再用 `setTimeout` 打开 `SettingSheet`。控制器显隐锁和快捷键阻断因此需要同时观察两个 open 状态。`SettingSheet` 又由整页 `SettingProvider` 依赖当前 HISTORY 记录，任何数据未就绪都会让全部内容不渲染。

现有 PlayerPortalRoot 已经解决 Sheet 位于 Web DOM 全屏内部的问题，Select 和 Popover 基础组件也接受 `container`，但播放器设置中的调用没有继续传递该容器，嵌套浮层仍可能回到 `document.body`。现有弹幕/字幕内容还复用了 `bg-background`、`border-input`、`dark:*` 和 zinc 色值，只靠局部 CSS 补丁无法保证固定播放器配色。

本变更建立一套播放器专属的设置组合层，不改变 playback-core、danmaku-engine、字幕适配器或平台 Port 的职责。

## 目标与非目标

**目标：**

- 用唯一的右侧侧栏承载播放、弹幕、字幕和播放列表设置。
- 让所有入口原子地打开目标标签，不再关闭并延迟打开另一套 Sheet。
- 保持播放会话级状态留在 PlayerControls/runtime，持久化偏好留在现有 Jotai/Dexie 边界。
- 让标签和操作由 PlayerCapabilities 决定，避免不支持能力的空入口。
- 建立与应用 light/dark 主题无关的固定深色 IINA 毛玻璃材质。
- 让 Sheet 内所有嵌套浮层使用 PlayerPortalRoot，在 Electron/Web 全屏中保持正确层级。
- 保留键盘导航、焦点恢复、控制器可见锁、全局快捷键阻断和 reduced motion。

**非目标：**

- 不增加视频轨道、音轨、HDR、裁切、均衡器、副字幕样式等新媒体能力。
- 不修改 HISTORY schema、播放器核心包、字幕/弹幕运行时协议或平台 Port 契约。
- 不让倍速和画面旋转变成跨会话持久化设置；继续沿用当前会话级语义。
- 不重做普通应用设置页，不把固定播放器材质写入全局 shadcn 主题。
- 不响应 `prefers-reduced-transparency`，但继续尊重 reduced motion。
- 不新增手机、平板触控或移动端响应式布局。

## 决策

### 1. 使用单一面板状态表达 open 与当前标签

删除 `inspectorOpen` 与 `playerSettingSheetAtom`/`playerSettingSectionAtom` 的双轨组合，改为一个原子状态：

```ts
type PlayerSettingsSection = 'playback' | 'danmaku' | 'subtitle' | 'playlist'

interface PlayerSettingsPanelState {
  open: boolean
  section: PlayerSettingsSection
}
```

公开动作只包含 `openPlayerSettings(section)`、`closePlayerSettings()` 和标签切换。设置按钮显式打开 `playback`；弹幕、字幕和列表入口显式打开对应标签。关闭时保留 section 值不影响下次显式入口，避免使用多个原子产生 open 已更新但 section 尚未更新的中间帧。

控制器锁定与快捷键阻断只观察 `state.open`：

```text
panel.open
├── true  → 控制器保持可见、停止自动隐藏、阻断播放器全局快捷键
└── false → 恢复快捷键、从当前活动重新开始自动隐藏计时
```

### 2. 统一面板挂载在 PlayerControls 内

`PlayerControls` 已经拥有当前 rate、PlaybackCommands、rotation 回调、capabilities、控制器可见状态和所有设置入口。新的 `PlayerSettingsPanel` 作为它的子组件挂载，可直接组合播放标签而无需把会话级状态抬升到 Jotai 或 NativePlayer。

`NativePlayer` 继续持有视频 rotation 状态和平台 ports，通过现有 props 传给 PlayerControls；删除独立挂载的 SettingSheet。PlayerInspector 的倍速/旋转内容迁入播放标签后删除该组件，退出播放不迁入新面板。

```text
NativePlayer（ports、rotation、providers）
└── PlayerControls（commands、rate、visibility）
    └── PlayerSettingsPanel
        ├── PlaybackSettings
        ├── DanmakuSettings
        ├── SubtitleSettings
        └── PlaylistSettings
```

面板仍位于 NativeDanmakuProvider 与 NativeSubtitleProvider 下，因此弹幕和字幕内容继续使用现有 Context，不增加跨层访问 video 元素或 adapter 的捷径。

### 3. 用 capabilities 构建稳定标签配置

标签配置由当前会话能力过滤后交给 Radix Tabs：

- `playback`：始终显示。
- `danmaku`：当前原生播放器进入 ready 后显示。
- `subtitle`：存在 embeddedSubtitle 或 externalSubtitle 能力时显示。
- `playlist`：仅 directoryPlaylist 为真时显示。

入口与标签使用同一能力判断，避免入口能打开一个已被过滤的 section。若换片导致当前 section 不再可用，面板回退到 `playback`，并把焦点移动到仍存在的标签，而不是保留不可见内容。

顶部标签栏固定在侧栏顶部，内容区独立滚动。播放列表使用自己的长内容布局，但不创建与外层竞争的整页滚动容器。桌面侧栏目标宽度使用 `clamp(380px, 28vw, 440px)`；不定义移动端 Dock 或底部 Sheet。

### 4. 按数据边界拆分设置内容

统一外壳不再由 HISTORY 查询包住。各标签按真实来源读取数据：

| 内容                           | 数据/命令来源                                | 生命周期                         |
| ------------------------------ | -------------------------------------------- | -------------------------------- |
| 倍速、旋转                     | PlaybackSession、NativePlayer rotation       | 当前播放会话                     |
| 自动续播、迷你进度、控制器位置 | player settings atom                         | 跨会话持久化                     |
| 弹幕显示设置                   | player settings atom + NativeDanmaku runtime | 即时热更新并持久化               |
| 弹幕来源                       | 当前 HISTORY + player-loading                | 当前视频，查询未就绪只影响该分区 |
| 字幕轨道、偏移、导入           | NativeSubtitleProvider                       | 当前视频并沿用现有历史记录       |
| 播放列表                       | player-loading ready 数据                    | 当前目录会话                     |

现有 SettingProvider 收窄为只服务弹幕来源的 provider/query；播放、字幕和列表不等待 Dexie。来源重新匹配或清缓存仍可关闭面板并进入既有确认/匹配流程，但不得再通过第二套设置 Sheet 返回。

播放列表条目改为语义化 button，而不是带 onClick 的 li。当前项使用 `aria-current` 或等价状态并提供图形/文字标识，避免只靠颜色。选择新条目后沿用 player-loading 统一换片入口。

字幕轨道不再使用依赖系统绘制的原生 select，改用现有 Radix Select，以便固定播放器材质和 Portal 行为一致；错误仍作为可恢复状态留在当前标签。

### 5. 为播放器设置建立局部控件适配层

普通设置页继续使用全局 `SettingSelect`、`SettingSwitch`、FieldLayout 和 shadcn 主题。播放器设置通过专属组合组件或显式 className/variant 使用播放器 token，禁止依赖 `.dark`、`bg-background`、`text-foreground`、zinc 硬编码等应用主题样式。

对于复用的弹幕数据逻辑，给 DanmakuSetting 提供播放器表现参数和 Portal container，而不是复制状态更新逻辑。Select、Popover、Dialog、Tooltip 的播放器用法都从 `usePlayerPortalContainer()` 获取 container；基础组件已支持 container 时只补传递链，不修改默认 `document.body` 行为，以免影响普通页面。

### 6. 固定 IINA 材质只作用于 PlayerRoot

播放器设置 token 作用域限定在 `[data-player-root]`，初始基线为：

```text
panel              rgb(30 30 35 / 82%)
raised surface     rgb(255 255 255 / 8%)
selected surface   rgb(255 255 255 / 14%)
border             rgb(255 255 255 / 11%)
foreground         rgb(255 255 255 / 94%)
muted foreground   rgb(255 255 255 / 58%)
accent             #0a84ff
backdrop            blur(26px) saturate(125%)
```

这些值不引用全局 background/foreground，也不写 light/dark 覆盖。应用主题在面板打开时变化只会影响播放器外页面；播放器控制器、侧栏和嵌套浮层保持同一材质。

`prefers-reduced-transparency` 分支从播放器 CSS 删除，设置侧栏也不新增该媒体查询。仅保留技术能力降级：

```css
@supports not (backdrop-filter: blur(1px)) {
  /* 使用同色相的完全不透明深色表面 */
}
```

全高 blur 只应用在侧栏根表面，内部卡片不重复 backdrop-filter，避免多层视频采样。嵌套表面使用半透明纯色。面板进入/退出使用简短过渡，`prefers-reduced-motion` 下取消非必要位移。

### 7. 沿用 Radix Sheet/Tabs 的焦点语义

使用现有 Radix Sheet 负责模态焦点范围、Escape、外部点击和关闭后的焦点恢复；使用 Radix Tabs 负责方向键与选中状态。为了接近 IINA，视觉头部只显示图标加标签，保留无障碍标题供读屏读取，不需要可见的“设置”大标题。

所有图标继续使用项目现有 Mingcute 体系，装饰图标 `aria-hidden`。侧栏关闭按钮若保留，使用可访问中文名称并与标签栏同层，不重新加入任何会话退出含义。

## 风险与权衡

### 嵌套 Portal 容易遗漏

只把 Sheet 放进 PlayerPortalRoot 不足以证明下拉和 Popover 在 Web 全屏可见。实现中需要逐一盘点 Select、Popover、Dialog、Tooltip 和确认/匹配流程，并用 DOM 全屏实际打开取证。给播放器用的组合组件集中注入 container，可降低后续新增控件时遗漏的概率。

### 复用全局设置组件可能泄漏主题

直接复用现有 class 会让应用 light/dark 主题渗入播放器；完全复制组件又会造成设置逻辑分叉。设计选择复用状态与业务行为、分离播放器表现参数。实现后需在应用主题切换前后对同一打开面板截图比对。

### HISTORY 未就绪与换片会改变内容

弹幕来源查询可能短暂未完成，换片也会替换字幕与列表数据。将查询限制在来源区域并为当前 section 做能力回退，可以避免整面板空白；仍需验证快速换片时旧 query、焦点和打开的子浮层被正确清理。

### 全高毛玻璃存在 GPU 成本

持续播放的视频背景叠加全高 backdrop-filter 可能在部分 GPU 上增加合成成本。设计限制为单层 blur，并保留不支持 backdrop-filter 时的不透明降级。Electron/Web 窗口态和全屏需要观察滚动、视频帧和控制器交互；如果性能不足，优先提高底色不透明度并降低 blur，而不切换主题或响应减少透明度偏好。

### 当前变更与播放器运行时收尾改动相邻

设置重构将触及 PlayerControls、播放器 CSS 和现有 UI 回归测试，这些文件可能与运行时变更的收尾修改重叠。实施时必须基于当时工作树重新读取文件，保留已有时间轴、控制器和测试改动，避免用规划时快照覆盖用户修改。
