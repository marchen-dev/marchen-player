## 目的

library 的静态主推区。从作品列表中按规则挑出一部"继续观看"作为 featured，呈现大幅 backdrop、标题、meta、tags、summary、主 CTA、进度条。Hero 不轮播。

### 需求: featured 选择规则

系统 MUST 按以下规则确定 Hero 的 featured 作品：
1. 优先从"在看"作品（`watchedCount > 0 && watchedCount < totalEpisodes`）中按 `lastWatchedAt` 倒序取第一部；
2. 若没有"在看"作品，则使用作品列表中第一部（`shows[0]`）作为兜底。

#### 场景: 用户有正在观看的作品

- **GIVEN** library 含 3 部"在看"作品，按 `lastWatchedAt` 排序后第一部是《葬送的芙莉莲》
- **WHEN** library 加载完成
- **THEN** Hero featured SHALL 为《葬送的芙莉莲》

#### 场景: 用户没有"在看"作品

- **GIVEN** library 含若干作品，但所有作品 `watchedCount === 0` 或 `>= totalEpisodes`
- **WHEN** library 加载完成
- **THEN** Hero featured SHALL 为 `shows[0]`

#### 场景: 库为空

- **GIVEN** library 表为空
- **WHEN** library 加载完成
- **THEN** Hero SHALL 不渲染
- **AND** 整个页面 SHALL 显示 EmptyState

### 需求: backdrop 渲染

Hero MUST 使用 featured 作品的 `imageUrl`（竖封面）作为背景图，通过 CSS 模糊与渐变蒙层处理为横版氛围 backdrop。

#### 场景: 封面图加载成功

- **GIVEN** featured 作品有合法的 `imageUrl`
- **WHEN** Hero 渲染
- **THEN** backdrop SHALL 显示该封面图
- **AND** 图片 SHALL 应用 `object-fit: cover` 与渐变蒙层（顶部至底部、左侧至右侧）

#### 场景: 封面图加载失败

- **GIVEN** featured 的 `imageUrl` 返回 404 或加载超时
- **WHEN** 图片 onError 触发
- **THEN** backdrop SHALL 退回到 panel 色块占位
- **AND** Hero 文本内容 SHALL 仍可读

### 需求: 边界字段兜底

Hero MUST 对作品的可选字段做兜底渲染：
- `rating === 0` → 不渲染评分；
- `tags` 为空数组 → 不渲染 tag 行；
- `summary` 为空 → 不渲染简介段落；
- `watchedCount === 0` → 主 CTA 文案为「开始观看」且 SHALL 不渲染进度条；
- `watchedCount > 0` → 主 CTA 文案为「继续观看 · 第 XX 话」且 SHALL 渲染进度条。

#### 场景: 未开始观看的作品

- **GIVEN** featured 作品 `watchedCount === 0`
- **WHEN** Hero 渲染
- **THEN** 主 CTA 按钮文案 SHALL 为「开始观看」
- **AND** 进度条 SHALL 不出现

#### 场景: 已观看 N 集的作品

- **GIVEN** featured 作品 `watchedCount === 5`、`totalEpisodes === 12`
- **WHEN** Hero 渲染
- **THEN** 主 CTA 文案 SHALL 为「继续观看 · 第 06 话」（下一集集号补零）
- **AND** 进度条 SHALL 显示约 41% 进度

### 需求: CTA 行为

主 CTA 与「详情」按钮点击 MUST 触发与点击作品卡片相同的行为：打开该作品的 DetailOverlay。

#### 场景: 点击主 CTA

- **GIVEN** Hero 渲染中
- **WHEN** 用户点击「继续观看」按钮
- **THEN** featured 作品的 DetailOverlay SHALL 打开
