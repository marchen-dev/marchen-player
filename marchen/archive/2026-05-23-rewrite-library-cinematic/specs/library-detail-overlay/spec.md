## 目的

替代原 DetailSheet 的全屏覆盖详情页。提供 banner backdrop、浮起 poster、作品信息、主 CTA 与集数网格。

### 需求: 全屏覆盖布局

DetailOverlay MUST 以 inset:36px 的全屏覆盖形式渲染（在 library 主区之上）；MUST 含半透明 scrim 蒙层与圆角主体。

#### 场景: 用户点击作品打开详情

- **GIVEN** library 处于 normal 模式
- **WHEN** 用户点击任一作品卡片
- **THEN** scrim 蒙层 SHALL 淡入（约 200ms）
- **AND** DetailOverlay 主体 SHALL 以微缩放动画出现

### 需求: banner backdrop + 浮起 poster

详情页顶部 320px MUST 是 backdrop banner（使用 `imageUrl` 模糊处理 + 渐变蒙层）；poster（220×330）MUST 浮起在 banner 与下方信息区之间，使用 z-index 让其覆盖在 banner 上。

#### 场景: 详情页渲染

- **GIVEN** DetailOverlay 已打开
- **WHEN** 用户查看顶部
- **THEN** banner 区域 SHALL 显示作品 `imageUrl` 作为背景图
- **AND** 一张 220×330 的 poster SHALL 从 banner 区下沿浮起

### 需求: 信息区与主 CTA

信息区 MUST 包含：标题、meta 行（类型/集数/年份/评分）、tags、主 CTA「继续观看 / 开始观看」、详情副按钮、进度条（仅 `watchedCount > 0` 时）、简介（折叠时 3 行省略）。

#### 场景: 在看作品的信息渲染

- **GIVEN** 作品 `watchedCount: 12, totalEpisodes: 28`
- **WHEN** DetailOverlay 渲染
- **THEN** 主 CTA SHALL 显示「继续观看 · 第 13 话」
- **AND** 进度条 SHALL 出现，填充 43%

### 需求: 主 CTA 跳转播放

主 CTA 点击 MUST 触发"播放下一集"逻辑：找到第一个 `episodeId` 未在 `watchedEpisodeIds` 中且有 `fileHash` 的剧集，通过 `navigate(PLAYER, { state: { hash } })` 跳转。

#### 场景: 点击「继续观看」

- **GIVEN** 作品 watchedEpisodeIds: [1, 2]，第 3 集有 fileHash
- **WHEN** 用户点击主 CTA
- **THEN** DetailOverlay SHALL 关闭
- **AND** 路由 SHALL 切换到 `/player`，state 含第 3 集的 fileHash

#### 场景: 无可播放剧集

- **GIVEN** 作品所有未观看剧集都缺 fileHash
- **WHEN** 用户点击主 CTA
- **THEN** 主 CTA SHALL 处于 disabled 状态或 SHALL 不触发跳转

### 需求: 关闭交互

DetailOverlay MUST 支持三种关闭方式：右上 ✕ 按钮、点击 scrim 蒙层、ESC 键。

#### 场景: 用户按 ESC 关闭

- **GIVEN** DetailOverlay 打开
- **WHEN** 用户按 ESC
- **THEN** DetailOverlay SHALL 关闭
- **AND** library 主区 SHALL 保持原 chip / search / sort 状态

### 需求: 与 Manage 模式互斥

Manage 模式开启时 MUST NOT 渲染 DetailOverlay；点击卡片时 SHALL 走选择逻辑而非打开详情。

#### 场景: Manage 模式下点击卡片

- **GIVEN** library 处于 Manage 模式
- **WHEN** 用户点击任一作品卡片
- **THEN** DetailOverlay SHALL 不渲染
- **AND** 卡片 SHALL 切换选中状态
