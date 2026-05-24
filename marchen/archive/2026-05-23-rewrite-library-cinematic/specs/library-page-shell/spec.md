## 目的

library 路由的顶级容器与布局骨架。负责挂载主题作用域标记、安排 TopBar/Hero/Chips/Rails/DetailOverlay 的整体层级关系，并管理 Electron 拖拽窗口的可点区域。

### 需求: 主题作用域标记

页面 SHALL 在最外层 DOM 节点上挂载 `data-page="library"` 属性，使得后续 scoped token 选择器（如 `[data-page="library"]`、`.dark [data-page="library"]`）能够命中。

#### 场景: 进入 library 页面后挂载属性

- **GIVEN** 用户在 Electron 桌面端
- **WHEN** 导航到 `/#/library`
- **THEN** library 顶层容器节点 SHALL 含有 `data-page="library"` 属性
- **AND** 离开 library 路由后该属性 SHALL 不再存在于 DOM 中

### 需求: 不依赖 RouterLayout

页面 MUST 不使用 `RouterLayout`，由 library 自身实现顶级布局；这是为避免 RouterLayout 强制的 `pt-7` 顶部内边距与固定标题区与 sticky TopBar 设计冲突。

#### 场景: 顶部 TopBar 可压在 Hero 之上

- **GIVEN** library 页面渲染完毕且 library 表非空
- **WHEN** 用户滚动到顶部
- **THEN** TopBar SHALL 以 sticky 方式停留在视口顶部
- **AND** Hero banner SHALL 部分背景延伸至 TopBar 下方（视觉重叠）

### 需求: Electron 拖拽窗口可用

页面 MUST 让顶部 TopBar 区域可拖动窗口（macOS hiddenInset 标题栏依赖此），同时按钮等可交互区域 MUST 不可被拖拽吞掉点击。

#### 场景: macOS 用户拖拽 TopBar 空白区移动窗口

- **GIVEN** Electron macOS 窗口处于非全屏状态
- **WHEN** 用户按住 TopBar 上的空白区域（标题左侧或按钮之间）拖动
- **THEN** 整个窗口 SHALL 跟随鼠标移动

#### 场景: 按钮区域点击不被吞

- **GIVEN** TopBar 上有 search、sort、more 等按钮
- **WHEN** 用户点击任意按钮
- **THEN** 按钮 SHALL 正确触发，不会被拖拽逻辑吞掉
