## 目的

sidebar 中每一项导航的视觉与交互。icon-only 显示，hover 弹出 tooltip 显示中文标题，active 路由用左侧红条 + 背景轻填高亮。

### 需求: icon-only 显示

每个 nav 项 MUST 只渲染 icon（约 20–24px），不直接显示文字标签。

#### 场景: 默认状态

- **GIVEN** sidebar 渲染中
- **WHEN** 鼠标未悬停任何 nav 项
- **THEN** 每个 nav 项 SHALL 仅显示居中 icon，不显示中文文字

### 需求: hover tooltip

鼠标悬停某 nav 项时 MUST 在 icon 右侧弹出 tooltip 显示该项的中文标题（如「视频播放」「影视库」）。tooltip 复用项目已有的 shadcn Tooltip 组件。

#### 场景: 用户悬停 nav 项

- **GIVEN** sidebar 渲染中
- **WHEN** 鼠标悬停在某 nav icon 上约 0.5 秒
- **THEN** 一个 tooltip SHALL 从 icon 右侧弹出
- **AND** tooltip 内容 SHALL 是该路由的 `meta.title`（如「视频播放」）

#### 场景: 鼠标移开

- **GIVEN** tooltip 已显示
- **WHEN** 鼠标移出 nav 项
- **THEN** tooltip SHALL 在 hover-out 延迟后消失

### 需求: active 路由高亮

当前路由对应的 nav 项 MUST 显示 active 样式：
- 左侧 3px 红条（accent 色 + glow）
- 整体背景轻填（panel-2 级别灰）
- icon 颜色变为 foreground 主色

#### 场景: 用户在 library 路由

- **GIVEN** 当前路由为 `/library`
- **WHEN** sidebar 渲染
- **THEN** 「影视库」nav 项左侧 SHALL 出现 3px 红色高亮条
- **AND** 该 nav 项背景 SHALL 比其他项明显亮一些
- **AND** 其他 nav 项 SHALL 保持默认样式

### 需求: hover 状态

非 active 项 hover 时 MUST 显示一个轻度的背景填充，作为可点击反馈；active 项 hover 不再额外加重背景。

#### 场景: 悬停非 active 项

- **GIVEN** 当前路由为 `/player`，鼠标位于「影视库」icon 上
- **WHEN** 鼠标悬停
- **THEN** 「影视库」nav 项 SHALL 出现 panel-1 级别背景填充
- **AND** icon 颜色 SHALL 略变亮（fg-2 级别）
