## 目的

定义 page 向 AppHeader 注入标题与操作按钮的契约，含挂载、卸载、变形切换、跨页面隔离行为。

### 需求: page 注入 title 与 actions

任何 page MAY 通过注入机制向 AppHeader 提供 `title` 与 `actions` 两段内容；AppHeader SHALL 渲染当前 active page 注入的内容。

#### 场景: library 注入 title 与 actions

- **GIVEN** 用户进入 library 路由
- **WHEN** library 组件挂载完成
- **THEN** AppHeader MUST 在左侧（红绿灯让位之后）显示 library 的 title（如"影视库 8"）
- **AND** AppHeader MUST 在右侧显示 library 的 actions（搜索框、排序按钮、更多按钮）

#### 场景: player 不注入

- **GIVEN** 用户进入 player 路由
- **WHEN** player 组件挂载完成
- **THEN** AppHeader title 区域 MUST 为空
- **AND** AppHeader actions 区域 MUST 为空
- **AND** AppHeader 仅显示红绿灯让位与拖窗区

### 需求: page 切换时的清理

当 page 卸载或切换路由时，注入的 title 与 actions SHALL 被清空，新 page 注入的内容 MUST 在用户感知到的下一帧内生效，不出现旧 page 与新 page 内容并存或闪烁。

#### 场景: 从 library 切换到 player

- **GIVEN** 当前在 library，AppHeader 已显示 library 的 title 与 actions
- **WHEN** 用户点击 sidebar 上的 player nav item
- **THEN** AppHeader MUST 在切换完成的同一帧或下一帧清空 title 与 actions
- **AND** 用户 MUST 不感知到"影视库 8"残留在 player 页面 header 上

#### 场景: 从 player 切回 library

- **GIVEN** 用户在 player 页，AppHeader 为空
- **WHEN** 用户点击 sidebar 上的 library nav item
- **THEN** AppHeader MUST 在 library 数据加载完成后渲染最新的 title 与 actions

### 需求: manage 变形

注入机制 SHALL 支持 page 切换"变形"模式（如 library 的 manage 态），通过 variant 字段让 AppHeader 整条显示不同的内容（取消按钮、计数、批量操作按钮等）。

#### 场景: 进入 manage 态

- **GIVEN** 用户在 library 普通态
- **WHEN** 用户在更多菜单中点击"管理"
- **THEN** AppHeader 内容 MUST 立即切换为 manage 变形：左侧"取消"按钮 + 中间选中计数 + 右侧"全选/取消全选"与"删除 (N)"
- **AND** 普通态的搜索框、排序按钮 MUST 不再显示

#### 场景: 退出 manage 态

- **GIVEN** 用户在 library manage 态
- **WHEN** 用户点击"取消"按钮或按 ESC
- **THEN** AppHeader MUST 切回普通态，title 与 actions 与进入 manage 之前一致
