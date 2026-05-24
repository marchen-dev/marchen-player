## 目的

「继续观看」Rail 专用的 16:9 横向卡片。比 PosterCard 更"沉浸"，使用 backdrop 风格的封面铺底，叠加进度条与"下一集"标签。

### 需求: 横向布局与 backdrop

卡片 MUST 使用 16:9 宽高比的封面铺底，与 PosterCard 的 2:3 形成区分。

#### 场景: 渲染继续观看卡片

- **GIVEN** 一部「在看」作品
- **WHEN** LandscapeCard 渲染
- **THEN** 卡片图像区 SHALL 为 16:9 宽高比
- **AND** 卡片宽度 SHALL 约 320px

### 需求: 下一集元信息

卡片 MUST 在图像底部叠加层显示「下一集 · 第 XX 话」（基于 `watchedCount + 1`，集号补零至 2 位）。

#### 场景: 用户查看下一集集号

- **GIVEN** 作品 `watchedCount === 12`
- **WHEN** LandscapeCard 渲染
- **THEN** 底部叠加层 SHALL 显示「下一集 · 第 13 话」

### 需求: 进度条与百分比

卡片 MUST 在图像底部渲染一条横贯进度条；卡片下方文本 SHALL 显示「`watchedCount/totalEpisodes` 话 · 百分比% 已观看」。

#### 场景: 渲染已看 12/28 的作品

- **GIVEN** 作品 `watchedCount: 12, totalEpisodes: 28`
- **WHEN** LandscapeCard 渲染
- **THEN** 进度条填充比例 SHALL 约 43%
- **AND** 下方文本 SHALL 显示"12/28 话 · 43% 已观看"

### 需求: 点击行为

点击 LandscapeCard MUST 与点击 PosterCard 一致：打开该作品的 DetailOverlay。

#### 场景: 点击卡片

- **GIVEN** LandscapeCard 渲染中
- **WHEN** 用户点击卡片任意位置
- **THEN** 该作品的 DetailOverlay SHALL 打开
