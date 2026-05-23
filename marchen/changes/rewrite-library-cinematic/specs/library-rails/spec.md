## 目的

横向滚动的作品列表分区。library 共有两条 Rail：「继续观看」（landscape 卡片）和「所有作品」（poster 卡片）。支持滚动按钮、scroll-snap，并把鼠标垂直滚轮转为横向滚动以照顾鼠标用户。

### 需求: 两条 Rail 渲染

库非空时，系统 MUST 渲染两条 Rail：
1. 继续观看：仅包含 `watchedCount > 0 && watchedCount < totalEpisodes` 的作品，按 `lastWatchedAt` 倒序；空时不渲染该条。
2. 所有作品：渲染全部作品，按当前 sort 策略排序。

#### 场景: 有继续观看作品

- **GIVEN** library 中有 3 部「在看」作品
- **WHEN** library 主区渲染
- **THEN** 「继续观看」Rail SHALL 渲染在「所有作品」之上
- **AND** 「继续观看」Rail 内 SHALL 仅含这 3 部，使用 landscape 卡片

#### 场景: 没有继续观看作品

- **GIVEN** library 中所有作品都未观看或已看完
- **WHEN** library 主区渲染
- **THEN** 「继续观看」Rail SHALL 不出现
- **AND** 「所有作品」Rail SHALL 是唯一的卡片列表

### 需求: 滚动按钮

每条 Rail MUST 在标题右侧提供 ◀ ▶ 滚动按钮，点击一次滚动一个视口宽度的 80%；左/右到边时对应按钮 SHALL disabled。

#### 场景: Rail 在最左侧

- **GIVEN** Rail 内容横滚位置 scrollLeft === 0
- **WHEN** 用户查看按钮状态
- **THEN** ◀ 按钮 SHALL 处于 disabled 状态
- **AND** ▶ 按钮 SHALL 可点击（若总宽超出视口）

#### 场景: 用户点击向右

- **GIVEN** Rail 在最左
- **WHEN** 用户点击 ▶
- **THEN** Rail 内容 SHALL 平滑滚动约一个视口宽度的 80%
- **AND** 滚动完成后 ◀ 按钮 SHALL 变为可点击

### 需求: scroll-snap 与隐藏滚动条

Rail 内 MUST 启用 `scroll-snap-type: x mandatory`，每张卡片为 snap 起点；原生滚动条 SHALL 不可见。

#### 场景: 用户停止横向拖拽

- **GIVEN** 用户在 Rail 内 trackpad 横向滑动
- **WHEN** 用户释放滑动
- **THEN** 当前可视区域的左边缘 SHALL 自动对齐到最接近的卡片左边缘

### 需求: 鼠标滚轮转横向滚动

当鼠标指针位于 Rail 内时，系统 SHOULD 把鼠标垂直滚轮（deltaY）转为横向滚动（scrollLeft 加减），以便鼠标用户操作。

#### 场景: 鼠标用户在 Rail 上滚动滚轮

- **GIVEN** 鼠标指针悬停于「所有作品」Rail 内
- **WHEN** 用户向下滚动鼠标滚轮
- **THEN** Rail SHALL 横向向右滚动
- **AND** 页面整体 SHALL 不发生垂直滚动
