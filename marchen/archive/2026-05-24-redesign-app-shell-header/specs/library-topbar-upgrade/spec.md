## 目的

定义 library 现有 in-page TopBar 上提到全局 AppHeader 的迁移契约，保证 normal / manage / empty 三态在迁移后行为一致。

### 需求: normal 态保留全部既有交互

library normal 态注入到 AppHeader 的 actions SHALL 保留原 TopBar 上的全部交互：搜索（含 ⌘K 快捷键提示）、排序菜单、更多菜单。

#### 场景: 搜索关键字过滤

- **GIVEN** library 已加载至少 1 部作品，AppHeader 显示搜索框
- **WHEN** 用户在搜索框中输入"芙莉莲"
- **THEN** library 主区 MUST 仅显示标题或别名匹配"芙莉莲"的作品
- **AND** AppHeader 左侧的总数 MUST 更新为匹配数

#### 场景: 切换排序方式

- **GIVEN** library 已加载多部作品，AppHeader 显示排序按钮
- **WHEN** 用户点击排序按钮并选择"按评分降序"
- **THEN** library 主区 MUST 按评分从高到低重新排列
- **AND** 排序菜单 MUST 关闭

#### 场景: 打开更多菜单后进入管理

- **GIVEN** library 普通态
- **WHEN** 用户点击更多按钮，在弹出菜单中点击"管理"
- **THEN** 更多菜单 MUST 关闭
- **AND** library 与 AppHeader MUST 同时进入 manage 态

### 需求: manage 态批量操作

manage 态 SHALL 在 AppHeader 上提供取消、选中计数、全选/反选、删除四个动作，与上提前的行为一致。

#### 场景: 全选

- **GIVEN** library manage 态，已选中 3 部作品（共 8 部）
- **WHEN** 用户点击 AppHeader 上的"全选"按钮
- **THEN** library 主区 MUST 标记全部 8 部为选中
- **AND** AppHeader 的"全选"按钮 MUST 切换为"取消全选"
- **AND** AppHeader 计数 MUST 显示"选中 8 / 8"

#### 场景: 删除选中

- **GIVEN** library manage 态，已选中 2 部作品
- **WHEN** 用户点击"删除 (2)"按钮并在确认弹框中确认
- **THEN** 该 2 部作品 MUST 从 library 中移除
- **AND** library 与 AppHeader MUST 退出 manage 态回到普通态

### 需求: 空库态隐藏 actions

当 library 作品总数为 0 时，AppHeader actions 区 SHALL 不渲染搜索/排序/更多按钮，仅保留 title 显示"影视库 0"。

#### 场景: 空库时的 AppHeader

- **GIVEN** library 数据库中无任何作品
- **WHEN** 用户进入 library 路由
- **THEN** AppHeader title MUST 显示"影视库 0"
- **AND** AppHeader actions 区 MUST 为空
- **AND** 用户 MUST 无法看到搜索框、排序按钮、更多按钮
