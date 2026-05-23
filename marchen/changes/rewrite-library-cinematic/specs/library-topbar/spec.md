## 目的

library 的顶部工具栏。承担标题展示、search/sort/more 三组入口。在 Manage 模式下变形为"批量操作"专用工具栏（取消、计数、全选/取消全选、删除按钮）。

### 需求: 正常态布局

非 Manage 模式下，TopBar MUST 包含：标题「影视库」+ 作品计数、search pill（含 ⌘K 提示）、sort 按钮、more 按钮。

#### 场景: 库非空时渲染 TopBar

- **GIVEN** library 含 12 部作品
- **WHEN** TopBar 渲染
- **THEN** 左侧 SHALL 显示「影视库 12」
- **AND** 右侧 SHALL 依次显示 search pill、↕ sort 按钮、⋯ more 按钮

#### 场景: 空库时简化 TopBar

- **GIVEN** library 表为空
- **WHEN** TopBar 渲染
- **THEN** 仅 SHALL 显示标题「影视库 0」
- **AND** search、sort、more 按钮 SHALL 全部不渲染

### 需求: search pill 交互

search pill MUST 支持文本输入；输入非空时 SHALL 显示清除按钮 ✕（替代默认的 ⌘K 提示）。

#### 场景: 用户输入搜索词

- **GIVEN** search pill 为空
- **WHEN** 用户在 input 中输入 "Frieren"
- **THEN** ⌘K 提示 SHALL 被替换为 ✕ 按钮
- **AND** library 内容 SHALL 即时按 "Frieren" 过滤

#### 场景: 用户清空搜索

- **GIVEN** search pill 含有 "Frieren"
- **WHEN** 用户点击 ✕
- **THEN** input 内容 SHALL 清空
- **AND** library 内容 SHALL 恢复为未过滤状态

### 需求: sort 与 more 弹出菜单

点击 sort 或 more 按钮 MUST 弹出对应菜单；菜单 MUST 支持点击外部关闭、ESC 关闭，并且按钮在菜单打开时呈 active 样式。

#### 场景: 用户打开 sort 菜单

- **GIVEN** TopBar 渲染中，无菜单打开
- **WHEN** 用户点击 sort 按钮
- **THEN** sort 弹出菜单 SHALL 出现在按钮下方
- **AND** sort 按钮 SHALL 呈 active（高对比度）样式

#### 场景: 用户点击菜单外部

- **GIVEN** sort 或 more 菜单打开
- **WHEN** 用户在菜单外任意位置点击
- **THEN** 菜单 SHALL 关闭
- **AND** 对应按钮 SHALL 恢复默认样式

#### 场景: 同时只有一个菜单打开

- **GIVEN** sort 菜单已打开
- **WHEN** 用户点击 more 按钮
- **THEN** sort 菜单 SHALL 关闭
- **AND** more 菜单 SHALL 打开

### 需求: Manage 模式下变形

进入 Manage 模式时，TopBar MUST 切换为 manage 样式：左侧「取消」按钮、中央"选中 N / M"计数、右侧「全选/取消全选」+「删除 (N)」按钮。

#### 场景: 进入 Manage 后 TopBar 变形

- **GIVEN** library 处于 normal 模式
- **WHEN** 用户从 more 菜单点击「管理 / 批量删除」
- **THEN** TopBar SHALL 切换为 manage 样式
- **AND** 主区不再渲染 Hero，仅保留 Rails

#### 场景: 全部选中时按钮文案切换

- **GIVEN** library 处于 Manage 模式，共 12 部作品
- **WHEN** 已选中 12 部
- **THEN** 「全选」按钮文案 SHALL 切换为「取消全选」
- **AND** 「删除 (12)」按钮 SHALL 可点击

#### 场景: 未选中任何项时禁用删除

- **GIVEN** library 处于 Manage 模式，选中数为 0
- **WHEN** TopBar 渲染
- **THEN** 「删除」按钮 SHALL 处于 disabled 状态

### 需求: more 菜单内容

more 菜单 MUST 包含：「管理 / 批量删除」、「全部清空…」（危险样式）。SHALL 不包含设计稿中的「导入文件夹」与「刷新封面 / 元数据」（本变更不实现）。

#### 场景: 用户打开 more 菜单

- **GIVEN** 用户点击 more 按钮
- **WHEN** more 菜单弹出
- **THEN** 菜单 SHALL 含有「管理 / 批量删除」与「全部清空…」两项
- **AND** 「全部清空…」SHALL 以危险（accent 红橙色）样式呈现
