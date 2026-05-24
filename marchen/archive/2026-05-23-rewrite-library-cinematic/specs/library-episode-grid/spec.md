## 目的

DetailOverlay 内的剧集网格。替代原 EpisodeList 的纵向列表，使用 2D 网格布局（每行最少 280px）。每个 ep-tile 有三种状态：watched / next（下一集高亮）/ no-file（未关联本地文件）。

### 需求: 网格布局

ep-grid MUST 使用 CSS Grid，列宽 `repeat(auto-fill, minmax(280px, 1fr))`，行间距紧凑（约 6px）。

#### 场景: 默认窗口下渲染

- **GIVEN** library 在默认 1400 宽窗口下，库非空
- **WHEN** 用户打开任一作品的 DetailOverlay
- **THEN** ep-grid SHALL 渲染为约 4 列

### 需求: 三种 tile 状态

每个 ep-tile MUST 根据状态呈现对应样式：
- watched（`episodeId` 在 `watchedEpisodeIds` 中）：标题灰、集号显示为完成色；
- next（首个未观看且非 no-file）：背景带 accent 半透明、集号 accent 色、含小标签；
- no-file（`fileHash` 为空）：整体降透明度（约 50%），不可点击。

#### 场景: 已观看的集数

- **GIVEN** episode `episodeId` 在 `watchedEpisodeIds` 中
- **WHEN** ep-tile 渲染
- **THEN** 标题颜色 SHALL 为 fg-3（次要灰）
- **AND** 集号颜色 SHALL 为 done 状态色

#### 场景: 下一集高亮

- **GIVEN** 用户 watchedEpisodeIds: [1, 2]，第 3 集有 fileHash
- **WHEN** ep-grid 渲染
- **THEN** 第 3 集 ep-tile SHALL 含 next 标签
- **AND** 背景 SHALL 应用 accent 半透明色调

#### 场景: 无本地文件的集数

- **GIVEN** episode `fileHash` 为空
- **WHEN** ep-tile 渲染
- **THEN** 整体透明度 SHALL 降至约 50%
- **AND** 点击 SHALL 不触发任何行为

### 需求: 点击播放

点击 has-file 的 ep-tile MUST 触发 `navigate(PLAYER, { state: { hash: episode.fileHash } })`，并先关闭 DetailOverlay。

#### 场景: 用户点击有文件的集数

- **GIVEN** ep-tile 对应集数有 fileHash
- **WHEN** 用户点击该 tile
- **THEN** DetailOverlay SHALL 关闭
- **AND** 路由 SHALL 切换到 `/player`，state 含该集 fileHash

### 需求: 剧场版兼容

`totalEpisodes === 1` 的作品（剧场版）MUST 仍然能正确渲染 ep-grid（单 tile 占满行宽，无视觉异常）。

#### 场景: 剧场版作品

- **GIVEN** 作品 `totalEpisodes: 1`、单集有 fileHash
- **WHEN** DetailOverlay 打开
- **THEN** ep-grid SHALL 渲染 1 个 tile，占满第一行
- **AND** 点击 tile 行为与多集作品一致
