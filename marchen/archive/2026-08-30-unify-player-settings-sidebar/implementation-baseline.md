## 当前入口与状态

- `PlayerControls` 使用局部 `inspectorOpen` 打开 `PlayerInspector`，同时读取 `playerSettingSheetAtom` 判断另一套面板是否打开。
- `PlayerInspector` 承载倍速、旋转、弹幕/字幕/列表跳转与退出播放；跳转通过关闭自身后 `setTimeout` 打开 `SettingSheet`。
- `SettingSheet` 使用 `playerSettingSheetAtom` + `playerSettingSectionAtom`，以 Accordion 呈现播放列表、弹幕和字幕。
- `NativePlayer` 挂载 `SettingSheet`，并向 `PlayerControls` 传递三个 `showPlayerSettingSheet(section)` 入口。

## 数据与能力

- 倍速来自 PlaybackSession commands，旋转状态由 `NativePlayer` 持有。
- 自动续播、迷你进度、控制器位置和弹幕显示偏好来自 player settings atom。
- 弹幕来源依赖当前 HISTORY 查询与 player-loading；字幕依赖 NativeSubtitleProvider；播放列表依赖 player-loading ready 数据。
- Web 不提供目录播放列表；字幕标签由 embedded/external subtitle capabilities 决定。

## Portal 与主题

- Sheet 已通过 `usePlayerPortalContainer()` 挂载到 PlayerPortalRoot。
- Select/Popover 基础组件支持 `container`，但 SettingSelect 和 DanmakuSource 当前未传递，因此嵌套浮层默认进入 `document.body`。
- MatchDanmakuDialog 和确认流程需要在实现时验证全屏层级。
- 弹幕与字幕设置仍含 `bg-background`、`border-input`、`text-zinc-*`、`dark:*` 等应用主题样式。

## 验收能力矩阵

| 场景 | 播放 | 弹幕 | 字幕 | 播放列表 | 全屏浮层 |
|---|---|---|---|---|---|
| Electron 窗口态 | 是 | 是 | 内嵌/外挂 | 目录列表 | PlayerPortalRoot |
| Electron 原生全屏 | 是 | 是 | 内嵌/外挂 | 目录列表 | PlayerPortalRoot |
| Web 桌面 | 是 | 是 | 外挂 | 不支持 | PlayerPortalRoot |
| Web DOM 全屏 | 是 | 是 | 外挂 | 不支持 | 必须留在全屏根内 |
