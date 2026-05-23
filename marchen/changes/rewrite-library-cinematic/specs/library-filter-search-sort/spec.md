## 目的

library 主区的筛选/搜索/排序逻辑契约。覆盖 Chips 过滤（按观看状态）、search 模糊匹配、6 维 sort 的可观察行为。

### 需求: Chips 过滤分类

Chips MUST 提供 5 个分类，并显示各分类下作品数：
- 全部 = 全部作品；
- 在看 = `watchedCount > 0 && watchedCount < totalEpisodes`；
- 连载中 = `isOnAir === true`；
- 已看完 = `watchedCount >= totalEpisodes && totalEpisodes > 0`；
- 未开始 = `watchedCount === 0`。

#### 场景: 用户切换到「在看」

- **GIVEN** library 含 12 部作品，其中 7 部在看
- **WHEN** 用户点击「在看」chip
- **THEN** 「在看」chip SHALL 呈 active 样式
- **AND** 主区 SHALL 仅渲染一条 Rail，名称为「在看」，内含 7 部作品
- **AND** Hero、其他 Rail SHALL 不渲染

#### 场景: 切回「全部」恢复多 Rail

- **GIVEN** 当前 chip 为「在看」
- **WHEN** 用户点击「全部」
- **THEN** 主区 SHALL 恢复 Hero + 两条 Rail 的标准布局

### 需求: search 模糊匹配

search MUST 对作品的 `title` 与 `tags` 进行不区分大小写的子串匹配；search 非空时 MUST 与 chip 过滤共同生效（先按 chip 筛选，再按 search 过滤）。

#### 场景: 标题匹配

- **GIVEN** chip 选择「全部」
- **WHEN** 用户输入 "frieren"
- **THEN** 主区 SHALL 仅显示标题含 "frieren"（忽略大小写）的作品

#### 场景: tag 匹配

- **GIVEN** 一部作品 tags 含 "治愈"
- **WHEN** 用户输入 "治愈"
- **THEN** 该作品 SHALL 出现在结果中

#### 场景: 搜索 + chip 共同生效

- **GIVEN** chip 选择「在看」
- **WHEN** 用户输入 "MyGO"
- **THEN** 主区 SHALL 仅显示「在看」且标题/tag 含 "MyGO" 的作品

### 需求: 6 维 sort

sort MUST 提供 6 种维度：最近观看 / 标题 / 评分 / 观看进度 / 集数 / 播出年份；默认为「最近观看」。

#### 场景: 用户选择按评分排序

- **GIVEN** sort 当前为「最近观看」
- **WHEN** 用户从 sort 菜单选择「评分」
- **THEN** 「所有作品」Rail 内的作品 SHALL 按 `rating` 倒序重新排列
- **AND** sort 菜单项「评分」前 SHALL 显示已选中标记

#### 场景: 中文标题排序

- **GIVEN** sort 选择「标题」
- **WHEN** 作品列表渲染
- **THEN** 作品 SHALL 按 `title.localeCompare(other.title, 'zh')` 排序

### 需求: 搜索/筛选无结果

当 chip 或 search 共同导致结果为空时，主区 MUST 显示一个空结果提示（带搜索图标、"没有匹配项"、"试试清除筛选或搜索条件"）。

#### 场景: 搜索词无匹配

- **GIVEN** library 含 12 部作品
- **WHEN** 用户输入一个无匹配的搜索词
- **THEN** 主区 SHALL 隐藏所有 Rail，显示空结果提示
- **AND** Hero SHALL 不渲染
