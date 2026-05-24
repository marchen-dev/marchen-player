## 目的

定义 app 顶部全宽 header（AppHeader）的尺寸、布局与平台差异契约，承担 macOS 红绿灯让位与窗口拖拽。

### 需求: 高度与平台差异

AppHeader SHALL 根据运行平台采用不同高度：macOS 52px、Windows/Linux/Web 44px。

#### 场景: macOS 下 header 高度

- **GIVEN** 在 macOS 上运行 Marchen
- **WHEN** 应用启动并渲染 AppHeader
- **THEN** AppHeader 的高度 MUST 为 52px
- **AND** 头部左侧 MUST 留出至少 80px 不放置可点击元素，避让红绿灯（红绿灯位置 `(12, 12)`，直径 12，右端约 x=60，加 20px 视觉缓冲）

#### 场景: 非 macOS 下 header 高度

- **GIVEN** 在 Windows、Linux 或 Web 浏览器中运行
- **WHEN** 应用启动并渲染 AppHeader
- **THEN** AppHeader 的高度 MUST 为 44px
- **AND** 头部左侧 MUST 没有红绿灯让位空白

### 需求: 拖窗与点击区分

AppHeader 的背景与非交互区域 SHALL 设为 drag-region 允许拖动窗口，所有可点击子元素 MUST 显式标记 no-drag-region。

#### 场景: 拖拽 header 空白处移动窗口

- **GIVEN** 在 macOS 上 AppHeader 中存在空白区域（红绿灯让位区或 actions 之间的空隙）
- **WHEN** 用户在空白处按下鼠标并拖动
- **THEN** 操作系统窗口 MUST 跟随鼠标移动

#### 场景: 点击 header 上注入的按钮

- **GIVEN** library 路由已通过注入机制向 AppHeader 提供了搜索框、排序按钮等 actions
- **WHEN** 用户点击其中任一按钮
- **THEN** 按钮的点击事件 MUST 被触发
- **AND** 窗口 MUST 不发生拖拽

### 需求: 视觉与层级

AppHeader SHALL 与 sidebar 同处一个层级（z-index 不互相覆盖），并以 1px 底部分隔线划开 header 与主体内容区。

#### 场景: header 底部分隔线

- **GIVEN** AppHeader 已渲染
- **WHEN** 主题处于 light 或 dark 模式
- **THEN** AppHeader 底部 MUST 显示 1px 实线分隔线
- **AND** 分隔线颜色 MUST 跟随主题（light 取深灰半透明、dark 取浅灰半透明）

#### 场景: 透明背景在 library hero 渗入时的表现

- **GIVEN** 当前页是 library 路由且 hero banner 已渲染
- **WHEN** AppHeader 背景设为透明或半透明，hero 顶部通过负向 margin 渗入 header 下方
- **THEN** hero 内容 MUST 可见地透出
- **AND** 透出区域 MUST 通过 backdrop blur 蒙版平衡可读性
