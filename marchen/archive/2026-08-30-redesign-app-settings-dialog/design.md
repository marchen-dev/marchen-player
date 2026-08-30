## 背景

普通应用设置当前由 `useSettingModal` 向自定义 ModalStack 注册固定 ID `SETTING`，使用 ModalStack 默认的标题栏、padding、拖拽和弹性动画。内容区再由 `SettingModal` 切成 140px 左栏和右侧 ScrollArea，弹窗尺寸被调用方固定为 `800 × 700px`。通用页只有少量设置，因此大部分高度为空；默认 Modal 的外框、顶部分隔线、左栏分隔线和 `FieldsCardLayout` 卡片边框又同时竞争视觉层级。

分类配置以中文 `title` 作为身份，并把已经实例化的 ReactNode 存进配置对象；当前分类则保存在模块级 Jotai atom 中。Electron 主进程用中文“关于”作为目标值，renderer 对同一个 `showSetting` 事件注册了两个监听。ModalStack 发现相同 ID 已存在时只把已有项移到栈顶，不替换 props，因此“设置已经打开时从菜单进入关于”缺少稳定的原子切换路径。

主题使用 next-themes。当前主题分段控件使用 `defaultValue`，实际深色判断使用 `theme === 'dark'`，没有区分主题偏好 `system` 与实际解析结果 `resolvedTheme`；这会让系统深色下的 Logo 等资源仍按浅色处理。

应用设置还复用了 `FieldsCardLayout`、`FieldLayout`、`SettingSwitch` 和 `SettingSelect`。正在实施的 `unify-player-settings-sidebar` 也触及后两者，并在迁移完成前仍有播放器文件引用普通设置布局。因此本变更实现必须基于播放器侧栏完成后的工作树重新检查引用，不能用规划时快照覆盖相邻改动。

## 目标与非目标

**目标：**

- 建立跟随应用主题的紧凑桌面双栏设置弹窗，在 Electron `800 × 650` 最小窗口与 Web 桌面窗口中完整可用。
- 将分类收敛为通用、AI 服务、关于，删除重复的播放器分类。
- 让侧边栏、快捷键和桌面菜单使用稳定分类 ID，并让已打开弹窗可靠切换目标分类。
- 用应用设置专属的页面、区块和设置行组合替代卡片堆叠，同时保留现有设置值和业务操作。
- 正确区分主题偏好和实际主题，覆盖浅色、深色和系统实时切换。
- 让分类、设置行、AI 服务条目、嵌套 Dialog 和关闭行为具备完整键盘与焦点语义。
- 保持设置视觉和动画局部作用，不改变普通确认框与其他 ModalStack 消费方。

**非目标：**

- 不重新设计播放器设置侧栏，不把播放器固定深色毛玻璃 token 引入普通应用设置。
- 不保留“播放器”或“播放默认项”分类；播放器相关偏好只从播放上下文中的统一侧栏调整。
- 不改变设置持久化格式、AI Provider 数据结构、API Key 存储策略或连接测试协议。
- 不修改检查更新、清除缓存、重置应用和开机自启的业务语义。
- 不整体替换 ModalStack、Radix、ScrollArea 或 next-themes，也不重做所有全局 shadcn token。
- 不增加手机、平板触控或移动端响应式形态。

## 决策

### 1. 实现顺序依赖播放器侧栏收尾

`unify-player-settings-sidebar` 先完成并稳定共享设置控件改动，本变更再开始 apply。实施前重新读取工作树并全局搜索播放器对普通设置布局的引用：

```text
unify-player-settings-sidebar
  └── 完成播放器专属布局与共享控件参数
          ↓
redesign-app-settings-dialog
  ├── 删除应用设置 PlayerView 注册
  ├── 重做应用专属布局
  └── 仅在需要时扩展共享控件，不回退播放器参数
```

如果播放器仍依赖旧 `FieldLayout`，先保留旧组件供播放器过渡，应用设置使用新的专属组合；不通过原地改 className 让两个界面被动共享同一外观。

### 2. 使用稳定分类 ID 和受控状态

定义跨 main/shared/renderer 可理解的稳定 ID：

```ts
type AppSettingsSection = 'general' | 'ai' | 'about'
```

分类配置保存 `id`、中文 label、description、Mingcute icon 和渲染函数/组件引用，不再把中文标题当身份，也不把已实例化 ReactNode 作为 atom 值。当前状态只保存 section ID。

`openAppSettings(section = 'general')` 先更新 section atom，再向 ModalStack present 固定 ID。即使 ModalStack 发现弹窗已经存在而只将其移到顶层，受控 section 仍会让现有弹窗切到目标页。删除当前 `SettingProvider` 在挂载前写全局对象的初始化方式。

主进程 `createSettingWindow`、共享 RendererHandlers 和 macOS 菜单改传稳定 ID；renderer 只注册一个 `showSetting` listener。对无参数事件默认打开 `general`，未知值安全回退到 `general` 并且不创建空页面。

### 3. 用 ModalStack CustomModal 建立局部设置外壳

保留 ModalStack 的固定 ID、堆叠、Escape 和焦点范围，设置弹窗通过 `CustomModalComponent` 使用专属 `AppSettingsDialogShell`。不修改默认 Modal 的标题栏、拖拽、padding、外框和 spring 配置，从而避免影响确认框。

设置专属外壳自己渲染全屏居中容器、scrim、面板、可访问标题/说明和关闭按钮。设置不需要模拟窗口内拖拽，保持项目规定的系统箭头指针。背景点击默认不关闭，避免用户编辑 AI 配置或准备危险操作时误关；Escape 与显式关闭按钮仍可关闭。

目标尺寸：

```text
width:  min(840px, calc(100vw - 48px))
height: min(600px, calc(100vh - 48px))
grid:   168px minmax(0, 1fr)
```

在 Electron 最小宽度 800px 时可用宽度约 752px，右侧仍有约 584px。左栏固定，右侧由固定页面头和单一 ScrollArea 组成；页面内容不再创建相互竞争的整页滚动容器。Web 端仍按同一桌面布局缩放，不增加底部 Sheet 或移动导航。

### 4. 使用纵向 Tabs 承担分类语义

分类导航使用受控的纵向 Radix Tabs，获得方向键、选中状态和关联内容语义。左栏顶部显示“设置”，导航项采用统一 40px 高度、16–18px Mingcute 图标和中文标签；选中项通过表面、文字权重和语义状态共同表达，不只靠颜色。

右侧每个 TabsContent 包含固定的页面标题、简短说明和内容区。分类切换默认让新内容从顶部开始；主题实时变化不得重建 Tabs 或分类内容。AI 编辑表单属于嵌套 Dialog，其本地状态不因系统主题变化丢失。

### 5. 建立应用设置专属组合组件

普通设置页面使用以下语义组合：

```text
SettingsPage
├── SettingsPageHeader（标题、说明、可选页面操作）
└── SettingsSection（区块标题、可选说明）
    └── SettingsGroup（单一表面）
        ├── SettingsRow（label/description/control）
        ├── divider
        └── SettingsActionRow（普通或危险操作）
```

`SettingsRow` 负责把可见标题与 control ID/aria-labelledby 关联，支持说明、禁用原因和尾部控件。区块标题放在 grouped surface 外，相关项目在同一表面内用细分隔线连接；不再为单个开关创建一张独立厚卡。

这些组件作用于 `components/modules/settings`，不作为播放器材质组件。共享 `SettingSwitch`/`SettingSelect` 只保留状态转发和可访问属性扩展；视觉由应用设置行传入或由基础 shadcn token 决定。

### 6. 按三分类重新分配内容

通用：

- 应用：Electron 开机自启；Web 隐藏整个空分组。
- 外观：受控主题分段选择；Electron 播放记录海报开关。
- 数据：清除弹幕缓存、重置应用。重置使用 destructive 层级并沿用现有平台确认流程。

AI 服务：

- 页面头右侧提供“添加服务商”。
- 无配置时显示短说明和单一 CTA，不套空卡片。
- 有配置时使用单一列表表面；每项显示名称、类型、模型和截断地址。
- 激活项使用 radio/checked 语义和可见状态；编辑、删除图标按钮包含目标服务商的中文可访问名称。
- ProviderDialog、模型 Select/Combobox 继续使用现有 Portal 与全局 z-index 层级，Dialog 位于设置 ModalStack 之上，Popover 位于 Dialog 之上。

关于：

- 产品身份区显示 Logo、Marchen、版本和更新操作。
- 反馈渠道使用一致的紧凑链接行或按钮组。
- 删除缓存与重置区；这些操作只存在于通用的数据区。

删除 `PlayerView` 的分类注册和应用设置入口。播放器相关设置 atom 与数据不会因此删除，因为统一播放器侧栏仍使用它们。

### 7. 设置专属主题 token，不复用播放器材质

在 `[data-app-settings]` 作用域建立语义 token，并由 `.dark` 映射深色值。初始视觉基线：

```text
light
  scrim          rgb(0 0 0 / 22%)
  shell          #fbfbfc
  navigation     #f4f4f5
  grouped        #ffffff
  border         rgb(15 23 42 / 10%)
  primary text   rgb(9 9 11 / 92%)
  muted text     rgb(9 9 11 / 58%)

dark
  scrim          rgb(0 0 0 / 55%)
  shell          #18181b
  navigation     #121214
  grouped        #202024
  border         rgb(255 255 255 / 8%)
  primary text   rgb(255 255 255 / 92%)
  muted text     rgb(255 255 255 / 62%)
```

弹窗接近实色，只允许极轻的背景模糊，不使用播放器全高视频采样毛玻璃。选中导航和 hover 使用同色系低透明表面；系统蓝只用于需要明确状态的开关/焦点或现有主题控件，不引入渐变与发光。

`useAppTheme` 同时暴露主题偏好 `theme` 和实际主题 `resolvedTheme`：分段控件用受控 `value={theme}`，Logo/实际资源用 `resolvedTheme`。next-themes 在系统主题变化时只切换 class，不改变 section atom 或重挂设置外壳。

### 8. 焦点、标签与动态效果

- Radix Dialog 继续提供焦点范围、Escape 和关闭恢复；嵌套 ProviderDialog 优先关闭并把焦点还给对应添加/编辑按钮。
- 导航、Switch、Select、radio、图标按钮和链接全部使用原生/Radix 可操作元素，不用 `li onClick`。
- 装饰图标 `aria-hidden`；关闭按钮使用中文名称；AI 编辑/删除名称包含服务商名。
- 设置行通过 label、ID 或 aria-labelledby 建立可见标题与控件的程序化关系。
- 焦点环在浅色和深色中都可见，滚动区使用 `scroll-padding` 避免焦点被固定页面头遮挡。
- 设置弹窗使用约 160–200ms 的淡入和轻微 `0.98 → 1` 缩放，不使用回弹或拖拽光标；reduced motion 下取消非必要缩放与位移。

### 9. 验证分为结构、交互与视觉三层

自动验证覆盖稳定 section 状态、目标入口切换、平台分类过滤、主题偏好/实际主题解析和设置值不变。组件交互覆盖纵向 Tabs、已打开弹窗切换目标、AI 嵌套 Dialog/Popover、Escape 分层关闭和焦点恢复。

桌面验收至少覆盖：

```text
Electron 1400 × 900
Electron 800 × 650
Web 桌面窗口
× light / dark / system
× 通用 / AI 服务 / 关于
```

同时验证 macOS `Cmd+,`、菜单“关于 Marchen”、侧边栏齿轮、长 AI Provider 列表、无 Provider 空状态、系统主题实时变化与 reduced motion。

## 风险与权衡

### 播放器变更存在文件重叠

播放器侧栏正在修改 `SettingSwitch`、`SettingSelect`、Dialog、Switch 等共享文件。过早 apply 会覆盖或重复其 API 设计。缓解方式是把播放器侧栏完成作为任务 1 的显式门槛，实施时重新读取 diff，并优先新增应用专属组合而不是回写共享样式。

### 删除播放器分类降低离线可配置性

用户在没有播放视频时不能提前调整弹幕或播放偏好。这是已确认的产品取舍：播放器设置只属于播放上下文。不得为了规避该取舍又在通用页复制一部分播放器设置。

### CustomModal 需要自行负责设置 scrim 与外壳

绕过默认 Modal 视觉可以避免全局副作用，但设置专属外壳需要显式处理可访问标题、说明、关闭按钮、居中、焦点可见与窗口约束。组件验收必须覆盖这些行为，不能只验证截图。

### 稳定 ID 会触及跨进程契约

从中文标题迁移到 `general/ai/about` 会同时修改 main、shared 和 renderer。任一端遗漏会导致菜单入口回退或无响应。使用共享联合类型，并测试无参数、合法目标和未知目标三条路径。

### 系统主题初次解析可能短暂未就绪

next-themes 在首帧可能尚未提供 theme/resolvedTheme。设置外壳依靠根 class 选择材质，避免 JS 未解析时闪成另一主题；Logo 等依赖实际主题的资源需要安全 fallback，并在解析后无布局变化地更新。

### AI 嵌套浮层层级复杂

设置位于 ModalStack，ProviderDialog、Select 和 Combobox 通过 Portal 位于更高全局层级。重构外壳若意外创建新的 stacking context 或 overflow 裁切，可能出现浮层不可见或 Escape 关闭顺序错误。保留现有 z-index 体系并进行真实嵌套交互验收。

### 视觉紧凑度与未来扩展

当前三分类内容较少，较紧凑的 600px 高度更合适；未来 Provider 很多时依赖右侧单一滚动区扩展。避免根据当前通用页内容改成自动高度，否则分类切换会让弹窗尺寸跳动。
