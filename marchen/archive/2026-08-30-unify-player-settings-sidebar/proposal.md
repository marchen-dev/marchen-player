## 动机

当前播放器存在两套右侧设置 Sheet：`PlayerInspector` 承载倍速、旋转和跳转入口，`SettingSheet` 再用 Accordion 承载播放列表、弹幕和字幕。用户从“更多”进入弹幕或字幕时，界面会先关闭一套 Sheet，再延迟打开另一套，视觉和焦点都不连续；内部又混用普通应用主题、原生控件和局部深色覆盖，无法形成 IINA 式完整播放器控制中心。

播放器已经拥有独立的 PlayerRoot、Portal、能力对象和深色控制层，现在适合把所有真实可用的播放设置收敛到一个侧边栏。该侧边栏应保持与视频内容相协调的固定深色毛玻璃材质，不随 Marchen 白天或夜间主题变化，也不复制当前运行时尚未支持的轨道、HDR、均衡器等 IINA 功能。

## 变更内容

- 将 `PlayerInspector` 与现有播放器 `SettingSheet` 合并为唯一的右侧设置侧栏，移除关闭后延迟打开另一面板的跳转过程。
- 使用顶部标签组织“播放、弹幕、字幕、播放列表”四类内容；设置、弹幕、字幕和播放列表入口都打开同一侧栏并定位到对应标签。
- 播放标签接入现有倍速、画面旋转、自动续播、迷你进度和控制器位置能力；弹幕、字幕和播放列表标签保留现有真实功能与即时生效行为。
- 根据 Electron/Web capabilities 隐藏不支持的标签或操作，不展示视频轨道、音轨、HDR、裁切、均衡器等尚未实现的假入口。
- 从设置侧栏移除“退出当前播放”，退出继续由播放器现有关闭入口负责。
- 为播放器设置侧栏建立独立于应用主题的固定深色半透明材质、白色文字、灰色层级和蓝色选中状态；Marchen 主题切换不得改变播放器设置配色。
- 删除播放器响应系统 `prefers-reduced-transparency` 的行为。正常环境始终使用统一毛玻璃；仅在浏览器不支持 `backdrop-filter` 时回退为不透明深色表面。
- 确保 Sheet、Tabs、Select、Popover、Dialog 和 Tooltip 都挂载到 PlayerPortalRoot，在 Web DOM 全屏与 Electron 全屏中保持可见、可聚焦并遵循同一播放器材质。
- 保持播放器打开面板时的控制器可见锁、快捷键阻断、键盘导航、可见焦点和 reduced motion 行为。

## 能力

### 新增能力

- `unified-player-settings-panel`：提供单一播放器设置侧栏、能力驱动的顶部标签和一致的入口/关闭/焦点行为。
- `player-settings-content`：在统一侧栏中组合现有播放、弹幕、字幕和播放列表设置，并保持各自的数据来源、平台能力与即时生效语义。
- `player-settings-material`：提供不随应用主题变化的 IINA 风格固定深色毛玻璃材质及不支持 backdrop-filter 时的技术降级。

### 修改能力

- 无。现有播放、弹幕、字幕和播放列表运行时能力保持不变，本变更只重组播放器内的设置入口、呈现和交互。

## 影响范围

- Renderer 播放器控制层：`PlayerControls`、`PlayerInspector`、播放器设置 Sheet、播放器设置 atoms 和 `NativePlayer` 组合关系。
- 播放器设置内容：播放、弹幕来源与显示、字幕轨道与偏移、播放列表，以及它们依赖的 Jotai、Dexie、player-loading 和 player-runtime Context。
- UI 基础设施：播放器作用域 token、Sheet/Tabs/Select/Popover 的 Portal container 与局部样式覆盖。
- Electron/Web 桌面端播放器、窗口态和全屏态的视觉与键盘验收；不新增手机、平板触控或移动端响应式范围。
- 不新增媒体解码能力，不修改 HISTORY schema，不改变播放器核心包或平台 Port 契约。
