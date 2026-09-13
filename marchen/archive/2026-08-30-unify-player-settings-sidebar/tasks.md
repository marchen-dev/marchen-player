## 1. 建立设置重构基线

- [x] 1.1 盘点 PlayerInspector、SettingSheet、控制器快捷入口、面板 open/section 状态和所有播放器内 Select/Popover/Dialog/Tooltip，记录当前 Electron/Web capabilities 与 Portal container 传递情况
- [x] 1.2 为现有倍速、旋转、弹幕热更新、字幕轨道、播放列表换片、控制器可见锁和快捷键阻断补充重构前回归测试，确保重组 UI 不改变运行时行为
- [x] 1.3 准备明亮、暗色和高对比视频画面，以及 Electron 窗口态/全屏、Web DOM 全屏的设置侧栏视觉验收场景

## 2. 收敛面板状态与组合位置

- [x] 2.1 用单一 PlayerSettingsPanelState 替换 inspectorOpen、playerSettingSheetAtom 和 playerSettingSectionAtom，提供原子化的打开目标标签、切换标签、关闭和播放退出重置动作
- [x] 2.2 创建统一 PlayerSettingsPanel 外壳和能力驱动的播放、弹幕、字幕、播放列表顶部标签，处理当前标签因 capability 变化而回退到播放标签
- [x] 2.3 将统一面板挂载到 PlayerControls，迁移所有设置入口并从 NativePlayer 删除独立 SettingSheet，从代码库删除 PlayerInspector 及其关闭后 setTimeout 打开另一 Sheet 的流程
- [x] 2.4 让控制器显隐锁和播放器快捷键只观察统一面板 open 状态，验证关闭面板后焦点、快捷键与自动隐藏计时正确恢复
- [x] 2.5 从统一面板和相关 props 中删除“退出当前播放”，保留播放器现有窗口关闭入口且不改变会话销毁行为

## 3. 建立 IINA 侧栏外观与浮层基础设施

- [x] 3.1 在 PlayerRoot 内新增固定深色设置 token，完成目标宽度、全高侧栏、固定顶部标签、独立滚动内容、灰白层级、蓝色选中状态和单层毛玻璃材质
- [x] 3.2 清理播放器设置对全局 light/dark、background/foreground、zinc 和 dark variant 的依赖，验证应用主题切换不会改变已打开侧栏或嵌套浮层
- [x] 3.3 删除播放器已有 prefers-reduced-transparency 样式并禁止新面板响应该偏好，只为不支持 backdrop-filter 的环境保留完全不透明深色技术降级
- [x] 3.4 为播放器设置用的 Select、Popover、Dialog 和 Tooltip 建立统一 PlayerPortalRoot container 传递链，确保普通应用页面仍保持默认 Portal 行为
- [x] 3.5 为侧栏、标签、分段选择、开关、下拉和关闭控件统一 Mingcute 图标、中文可访问名称、选中/禁用状态和可见焦点，并在 reduced motion 下取消非必要位移

## 4. 实现播放标签

- [x] 4.1 将现有播放速度和画面旋转迁入播放标签，接回 PlaybackCommands 与 NativePlayer rotation，验证调整时不重载视频或改变进度
- [x] 4.2 将自动续播和底部迷你进度设置迁入播放标签，保持现有 Jotai 持久化和平台能力限制
- [x] 4.3 在播放标签提供控制器上方、默认、下方和重置位置预设，复用现有归一化位置与安全边界逻辑

## 5. 迁移弹幕标签

- [x] 5.1 复用弹幕设置数据逻辑并建立播放器专属表现参数，迁移显示开关、字号、持续时间、显示区域、悬停暂停和在屏密度，验证当前 DanmakuEngine 即时热更新
- [x] 5.2 将 HISTORY 查询 provider 收窄到弹幕来源区域，为加载、空数据和错误提供局部状态，确保其他标签不因来源数据未就绪而空白
- [x] 5.3 迁移来源选择、本地弹幕导入、重新匹配和清缓存流程，补齐 PlayerPortalRoot、确认交互、面板关闭与 player-loading 数据刷新行为

## 6. 迁移字幕与播放列表标签

- [x] 6.1 用播放器材质的 Radix Select 替代字幕原生 select，迁移轨道关闭/选择、外挂字幕导入、时间偏移和可恢复错误展示，并保持字幕资源释放语义
- [x] 6.2 将播放列表改为可滚动的语义化按钮列表，为当前项提供 aria-current 与非颜色唯一标识，并沿用 player-loading 统一换片入口
- [x] 6.3 根据 embeddedSubtitle、externalSubtitle 和 directoryPlaylist capabilities 过滤标签与入口，验证 Web 单文件不显示播放列表且不出现任何未实现 IINA 功能

## 7. 回归验证与视觉验收

- [x] 7.1 为统一面板状态、入口定位、能力过滤、不可用标签回退、面板关闭重置和 Portal container 传递补充单元/组件回归测试
- [x] 7.2 运行相关播放器与设置测试、项目 typecheck、Electron 构建和 Web 构建，修复本变更引入的问题
- [ ] 7.3 在 Electron 窗口态验证四个标签、全部现有设置、嵌套浮层、键盘焦点、控制器锁定、快速换片和侧栏滚动；原生全屏按用户要求免验
- [x] 7.4 在 Web 桌面窗口验证本地视频、字幕 Select、弹幕来源 Popover、能力隐藏、Escape/外部关闭和快捷键恢复；DOM 全屏按用户要求免验
- [ ] 7.5 在明亮、暗色和高对比视频上对比固定播放器材质，切换 Marchen 白天/夜间主题确认配色不变，并验证不支持 backdrop-filter 与 reduced motion 的各自降级
- [ ] 7.6 检查全高单层 backdrop-filter 下的视频帧、侧栏滚动和控制器交互；若合成成本过高，记录并仅通过提高底色不透明度或降低 blur 收敛参数
