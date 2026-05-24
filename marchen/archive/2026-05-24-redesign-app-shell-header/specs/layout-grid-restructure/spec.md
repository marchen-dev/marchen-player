## 目的

定义 RootLayout 从 flex 横排重构为 2×2 grid 的结构契约，确保 AppHeader 跨两列、sidebar 与主区从 header 下方齐平开始。

### 需求: 2×2 grid 布局

RootLayout SHALL 采用 CSS Grid 2 行 2 列，AppHeader 跨第一行两列，sidebar 占第二行第一列，主区占第二行第二列。

#### 场景: 默认布局尺寸

- **GIVEN** macOS 平台，窗口宽度 ≥ 800
- **WHEN** 应用渲染 RootLayout
- **THEN** 第一行高度 MUST 为 52px（AppHeader）
- **AND** 第二行高度 MUST 撑满剩余高度（`1fr`）
- **AND** 第一列宽度 MUST 为 72px（sidebar）
- **AND** 第二列宽度 MUST 撑满剩余宽度（`1fr`）

#### 场景: AppHeader 跨两列

- **GIVEN** RootLayout 已渲染
- **WHEN** 检查 AppHeader 的水平占位
- **THEN** AppHeader MUST 从窗口左边缘延伸到窗口右边缘
- **AND** AppHeader MUST 同时覆盖 sidebar 列与主区列的顶部

### 需求: sidebar 与主区从 header 下方齐平

sidebar 与主区的顶部 SHALL 与 AppHeader 的底部分隔线齐平，sidebar 不再承担红绿灯让位职责。

#### 场景: sidebar 顶部对齐

- **GIVEN** macOS 平台，AppHeader 高度 52px
- **WHEN** 用户查看 sidebar 顶部
- **THEN** sidebar 第一个 nav item 之上的 padding MUST 与主区顶部 padding 一致（与平台无关，均为标准 18px 上 padding）
- **AND** sidebar 顶部 MUST 不出现 56px 让位空白

### 需求: 主区滚动隔离

主区内容（如 library hero + cards）滚动时 SHALL 不影响 AppHeader 与 sidebar 的位置，AppHeader 与 sidebar MUST 在视口固定。

#### 场景: 主区滚动时 header/sidebar 不动

- **GIVEN** library 主区有足够内容产生纵向滚动
- **WHEN** 用户在主区滚动鼠标滚轮或拖动滚动条
- **THEN** AppHeader MUST 保持在视口顶部不动
- **AND** sidebar MUST 保持在视口左侧不动
- **AND** 只有主区内容滚动
