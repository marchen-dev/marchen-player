## 目的

thin sidebar 的顶级容器与布局骨架。负责 72px 固定宽度、纵向三段布局（brand-mark / nav / settings）、跨路由一致呈现，以及 macOS 拖拽窗口的可用性。

### 需求: 固定宽度 72px

sidebar MUST 在所有路由下保持 72px 宽度，不受主区内容影响。

#### 场景: 用户切到 library 路由

- **GIVEN** Electron 桌面端，dark 主题
- **WHEN** 用户从 player 切换到 library
- **THEN** sidebar 宽度 SHALL 保持 72px
- **AND** library 主区获得余下全部横向空间

### 需求: 纵向三段布局

容器 MUST 包含：顶部 brand-mark（38×38）、中部 nav 列表（flex: 1 占用剩余空间）、底部设置齿轮 icon。

#### 场景: 渲染结构

- **GIVEN** 用户进入 Electron 应用
- **WHEN** 主窗口加载完成
- **THEN** sidebar SHALL 从上到下依次显示：brand-mark、若干 nav icon、设置齿轮
- **AND** brand-mark 与底部齿轮 SHALL 分别贴近顶部与底部

### 需求: brand-mark 跳转主页

点击 brand-mark MUST 导航到 `/player` 路由（与早期版本的"点击 logo 回主页"行为保持一致）。

#### 场景: 用户点击 brand-mark

- **GIVEN** 用户当前在 library 路由
- **WHEN** 点击 sidebar 顶部 brand-mark
- **THEN** 应用 SHALL 导航到 `/player`

### 需求: 拖拽窗口可用

sidebar 顶部 brand-mark 所在区域 MUST 标记为 drag-region，让 macOS hiddenInset titlebar 用户能从该区域拖动窗口；nav icon 与设置齿轮 MUST 标记 no-drag-region 避免点击被吞。

#### 场景: macOS 用户拖拽窗口

- **GIVEN** Electron macOS 应用处于非全屏状态
- **WHEN** 用户按住 brand-mark 周围空白区拖动
- **THEN** 整个窗口 SHALL 跟随鼠标移动

#### 场景: 点击 nav icon 不被吞

- **GIVEN** sidebar 渲染中
- **WHEN** 用户点击任一 nav icon
- **THEN** 该 icon 的 onClick SHALL 正确触发，不被 drag 行为拦截
