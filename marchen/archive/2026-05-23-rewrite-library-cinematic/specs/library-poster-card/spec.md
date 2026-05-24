## 目的

「所有作品」Rail 内的标准海报卡片。展示作品封面与基础元信息，承担多种状态（On Air / 已看完 / 在看进度），并在 Manage 模式下转为可勾选样式。

### 需求: 基础信息渲染

卡片 MUST 渲染：作品封面、标题（单行截断）、`watchedCount/totalEpisodes` 元信息。

#### 场景: 渲染正常作品

- **GIVEN** 一部 `title: '葬送的芙莉莲'`、`watchedCount: 12`、`totalEpisodes: 28` 的作品
- **WHEN** PosterCard 渲染
- **THEN** 卡片 SHALL 显示封面与标题"葬送的芙莉莲"
- **AND** 副信息行 SHALL 显示"12/28"

### 需求: 状态徽标

卡片 MUST 根据作品状态显示对应徽标（非 Manage 模式下）：
- 左上：`rating > 0` 时显示「★ X.X」评分徽标；
- 右上：`isOnAir === true` 时显示「连载中」徽标（带脉冲动画）；否则若已看完显示「已看完」徽标；
- 在看时（`watchedCount > 0 && < total`）：底部覆盖进度条。

#### 场景: 连载中的作品

- **GIVEN** 一部 `isOnAir: true`、`rating: 8.7` 的作品
- **WHEN** PosterCard 渲染（非 Manage 模式）
- **THEN** 左上 SHALL 显示「★ 8.7」
- **AND** 右上 SHALL 显示「连载中」徽标且含脉冲圆点

#### 场景: 已看完的作品

- **GIVEN** 一部 `watchedCount === totalEpisodes && isOnAir === false` 的作品
- **WHEN** PosterCard 渲染
- **THEN** 右上 SHALL 显示「已看完」徽标
- **AND** 底部进度条 SHALL 不渲染

#### 场景: 在看中的作品

- **GIVEN** 一部 `watchedCount === 5`、`totalEpisodes === 12` 的作品
- **WHEN** PosterCard 渲染
- **THEN** 底部 SHALL 渲染进度条，填充比例约 41%

### 需求: hover 播放按钮

非 Manage 模式下，鼠标悬停 PosterCard 时 MUST 显示一个浮起的圆形播放按钮蒙层。

#### 场景: 用户 hover 卡片

- **GIVEN** PosterCard 处于非 Manage 模式
- **WHEN** 鼠标进入卡片区域
- **THEN** 卡片 SHALL 微微上移并放大（约 4px / scale 1.025）
- **AND** 一个红橙色圆形播放按钮 SHALL 在卡片中心淡入

### 需求: Manage 模式下的样式与交互

Manage 模式下：卡片 hover 不显示播放按钮；左上角 MUST 出现 pick 圆点；选中时 SHALL 显示明显的 outline 与勾选图标。

#### 场景: Manage 模式下未选中的卡片

- **GIVEN** library 处于 Manage 模式
- **WHEN** 用户查看一张未选中的 PosterCard
- **THEN** 左上 SHALL 出现一个空心圆点（pick）
- **AND** 评分徽标、连载中徽标 SHALL 不渲染

#### 场景: Manage 模式下选中卡片

- **GIVEN** library 处于 Manage 模式
- **WHEN** 用户点击一张未选中的卡片
- **THEN** 该卡片 pick 圆点 SHALL 变为红橙底色并显示勾选图标
- **AND** 整张卡片 SHALL 出现 2.5px 红橙 outline

### 需求: 图片占位与失败回退

封面图 MUST 在加载中显示 panel 色块占位；加载失败时 SHALL 显示静态占位（panel 色块 + 作品标题），不破坏布局。

#### 场景: 封面图未加载完成

- **GIVEN** PosterCard 渲染时 `imageUrl` 尚未加载完成
- **WHEN** 用户查看卡片
- **THEN** 海报区域 SHALL 显示一个 panel 色块占位
- **AND** 占位区域 SHALL 不导致卡片高度抖动
