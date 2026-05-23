## 目的

库内批量管理流程。允许用户进入"选择模式"，多选作品后批量从库中移除，或一键清空全库。包含 ConfirmDialog 二次确认与 Toast 反馈，ESC 可退出。

### 需求: 进入与退出 Manage 模式

Manage 模式 MUST 通过 TopBar more 菜单的「管理 / 批量删除」进入；MUST 可通过 TopBar「取消」按钮、ESC 键、或完成删除操作后自动退出。

#### 场景: 通过 more 菜单进入

- **GIVEN** library 非空，处于 normal 模式
- **WHEN** 用户从 more 菜单点击「管理 / 批量删除」
- **THEN** library SHALL 进入 Manage 模式
- **AND** TopBar SHALL 切换为 manage 样式
- **AND** Hero SHALL 不渲染（避免占用空间）

#### 场景: ESC 键退出

- **GIVEN** library 处于 Manage 模式，已选中 3 项
- **WHEN** 用户按下 ESC
- **THEN** Manage 模式 SHALL 退出
- **AND** 选中状态 SHALL 清空

### 需求: 单卡选择切换

Manage 模式下，点击 PosterCard MUST 切换该作品的选中状态（已选 → 取消选中，未选 → 选中），而 SHALL NOT 打开 DetailOverlay。

#### 场景: 用户点击未选中的卡片

- **GIVEN** library 处于 Manage 模式，某卡片未选中
- **WHEN** 用户点击该卡片
- **THEN** 卡片 pick 圆点 SHALL 变为已选样式
- **AND** TopBar 计数 SHALL +1
- **AND** DetailOverlay SHALL 不打开

### 需求: 全选与取消全选

TopBar MUST 提供「全选/取消全选」按钮：
- 选中数 < 总数 时，按钮文案为「全选」，点击后选中全部可见作品；
- 选中数 === 总数 时，按钮文案为「取消全选」，点击后清空选中。

#### 场景: 全选所有作品

- **GIVEN** library 处于 Manage 模式，已选中 3 / 12
- **WHEN** 用户点击「全选」
- **THEN** 12 部作品 SHALL 全部呈选中状态
- **AND** 按钮文案 SHALL 切换为「取消全选」

### 需求: 批量删除 + Confirm

点击「删除 (N)」MUST 弹出 ConfirmDialog 二次确认；确认后才执行 `db.library.bulkDelete`，然后退出 Manage 模式并弹出 Toast 反馈。

#### 场景: 用户确认批量删除

- **GIVEN** Manage 模式，已选中 3 部
- **WHEN** 用户点击「删除 (3)」
- **THEN** ConfirmDialog SHALL 弹出，标题"删除选中的 3 项？"
- **AND** 用户点击「删除」按钮后，3 部作品 SHALL 从 IndexedDB library 表删除
- **AND** Manage 模式 SHALL 退出
- **AND** Toast SHALL 显示「已移除 3 项」约 2.4 秒

#### 场景: 用户取消删除

- **GIVEN** ConfirmDialog 已弹出
- **WHEN** 用户点击「取消」或按 ESC
- **THEN** ConfirmDialog SHALL 关闭
- **AND** Manage 模式 SHALL 保持，选中状态不变
- **AND** 作品 SHALL 不被删除

### 需求: 全部清空

more 菜单的「全部清空…」MUST 同样走 ConfirmDialog 流程；确认后调用 `db.library.clear()`。

#### 场景: 用户清空全库

- **GIVEN** library 含 12 部作品
- **WHEN** 用户从 more 菜单点击「全部清空…」并确认
- **THEN** IndexedDB library 表 SHALL 全部清空
- **AND** 主区 SHALL 切换到 EmptyState
- **AND** Toast SHALL 显示「已清空影视库」
