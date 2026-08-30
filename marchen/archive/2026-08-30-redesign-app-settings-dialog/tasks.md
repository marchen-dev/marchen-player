## 1. 确认实施基线与相邻变更

- [x] 1.1 确认 `unify-player-settings-sidebar` 已完成或工作树已稳定，重新读取其对 SettingSwitch、SettingSelect、Dialog、Switch 和播放器设置布局的最终改动，记录本变更可安全编辑的边界
- [x] 1.2 全局盘点应用设置入口、分类状态、main→renderer 设置事件、主题消费、AI 嵌套浮层和旧 Layout 组件引用，确认删除 PlayerView 不会删除播放器仍使用的数据与控件
- [x] 1.3 为当前侧边栏齿轮、Cmd/Ctrl+,、macOS“关于 Marchen”、分类切换、系统主题、AI Provider CRUD 和数据操作补充重构前行为基线或回归用例

## 2. 收敛分类状态与设置入口

- [x] 2.1 在共享契约中定义 `general | ai | about` 稳定分类 ID，更新 main 设置事件、macOS 菜单和 renderer 类型，保留无参数默认通用与未知值安全回退
- [x] 2.2 将当前分类状态改为只保存稳定 ID，把分类配置重组为 id、中文标签、说明、Mingcute 图标和组件引用，删除以中文标题和 ReactNode 对象作为身份的状态结构
- [x] 2.3 重写 `openAppSettings(section)`，先原子更新目标分类再 present 固定设置弹窗 ID，确保弹窗已打开时直接切换目标而不重复创建
- [x] 2.4 合并 IpcListener 中重复的 `showSetting` 监听，验证侧边栏、快捷键和菜单入口都走同一路径且“关于”可在已打开弹窗中可靠定位

## 3. 建立设置专属双栏外壳

- [x] 3.1 使用 ModalStack CustomModal 创建 `AppSettingsDialogShell`，实现专属 scrim、可访问标题/说明、关闭按钮和非拖拽外壳，不改变默认 Modal 与其他确认框
- [x] 3.2 实现 `min(840px, 100vw - 48px)` × `min(600px, 100vh - 48px)` 桌面布局、168px 固定导航和右侧固定页面头/单一 ScrollArea，覆盖 Electron `800 × 650` 最小窗口
- [x] 3.3 使用受控纵向 Tabs 实现通用、AI 服务、关于导航，补齐方向键、选中状态、页面关联和分类切换回到内容顶部的行为
- [x] 3.4 在设置专属作用域建立浅色/深色 shell、navigation、grouped surface、border、text、selected、focus 和 scrim token，完成 160–200ms 轻量进入退出与 reduced motion 降级
- [x] 3.5 验证关闭按钮、Escape、重复打开和子 Dialog 分层关闭后的焦点恢复，确保设置 scrim 不误用全局浅色漂白遮罩

## 4. 建立应用设置内容组件

- [x] 4.1 新增 SettingsPageHeader、SettingsSection、SettingsGroup、SettingsRow 和 SettingsActionRow，统一标题、说明、行高、分隔、控件对齐、禁用说明和危险操作层级
- [x] 4.2 为 SettingsRow 建立可见 label/description 与 Switch、Select、Tabs、按钮之间的 ID 或 aria-labelledby 关联，并为滚动内容配置不遮挡焦点的 scroll padding
- [x] 4.3 将普通应用设置页面迁入新组合组件；若播放器仍引用旧 FieldLayout/FieldsCardLayout，则保留过渡组件而不原地改变其播放器表现

## 5. 重组通用、AI 服务和关于

- [x] 5.1 将通用页重组为应用、外观、数据三个区块，保留开机自启、主题和播放记录海报语义，并在 Web 隐藏 Electron 专属操作及其空分组
- [x] 5.2 将清除弹幕缓存和重置应用从关于页迁入通用的数据区，保留成功/失败反馈和平台确认流程，并把重置呈现为明确危险操作
- [x] 5.3 将主题分段控件改为受控偏好值，保持系统/白天/夜间三项及 Electron nativeTheme 同步，不因页面重构改变持久化语义
- [x] 5.4 重构 AI 服务页为空状态或单一 Provider 列表表面，将“添加服务商”放到页面级操作区，并保持添加、编辑、测试、激活、删除和当前 Provider 数据行为
- [x] 5.5 为 AI 激活项使用 radio/checked 和非颜色唯一标识，为编辑/删除按钮提供包含服务商名称的中文可访问名称，验证长名称、模型和 Base URL 截断
- [x] 5.6 重构关于页为产品身份、版本/更新和反馈渠道，使用实际解析主题显示 Logo，并删除所有缓存与重置操作
- [x] 5.7 从应用设置分类和入口中删除 PlayerView/“播放器”，清理仅为旧应用播放器页存在的布局引用，同时保留统一播放器侧栏使用的设置 atom 与业务数据

## 6. 修正主题与嵌套浮层边界

- [x] 6.1 扩展应用主题 hook 以区分主题偏好和 resolvedTheme，让系统深色正确驱动 Logo 与实际主题资源，并为初次未解析状态提供无布局闪烁的 fallback
- [x] 6.2 验证设置打开时系统主题实时切换不会重建弹窗、改变当前分类、重置滚动或丢失未提交的 AI Provider 表单状态
- [x] 6.3 验证 ProviderDialog、类型 Select、模型 Combobox、删除确认和重置确认在设置专属外壳上方正确显示，不被 overflow/stacking context 裁切且 Escape 按层级关闭
- [x] 6.4 检查浅色和深色下文字、边界、开关、选中、悬停、焦点、禁用和危险状态，确保关键状态不只依赖颜色表达

## 7. 回归测试与桌面验收

- [x] 7.1 为稳定分类 ID、默认/目标入口、已打开弹窗切换、未知目标回退、三分类结构和平台过滤补充单元或组件测试
- [x] 7.2 为纵向 Tabs 键盘操作、设置行标签关联、AI radio/图标按钮语义、嵌套 Escape 关闭和焦点恢复补充交互回归测试
- [x] 7.3 运行相关设置与主题测试、项目 typecheck、lint、Electron 构建和 Web 构建，修复本变更引入的问题且不回退播放器侧栏测试
- [x] 7.4 在 Electron `1400 × 900` 和 `800 × 650` 验证侧边栏齿轮、Cmd+,、菜单关于、三分类、内容滚动、AI 嵌套浮层、数据确认与关闭焦点
- [x] 7.5 在 Web 桌面窗口验证三分类、Electron 操作隐藏、主题切换、AI Provider、数据操作和长内容滚动，不扩展移动端布局
- [x] 7.6 分别在浅色、深色和系统主题下截取通用/AI/关于视觉证据，切换 OS 主题验证实时同步，并确认普通确认框和其他 Modal 未继承设置双栏外观
- [x] 7.7 在 reduced motion 下验证无回弹、拖拽或非必要位移，在键盘全流程中确认焦点始终可见且所有操作可达
