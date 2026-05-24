## 背景

DetailOverlay 内的 EpisodeGrid 当前每集右列显示首播日期 `MM-DD`，对本地播放器场景没什么意义。改为显示「单集观看进度」：

- 数据来源：`history` 表按 `fileHash` 拿 `progress / duration` 算百分比
- 显示规则：
  - 已观看 (`watchedEpisodeIds` 命中) → `✓`
  - 进度 ≥ 1% 且未达完成 → `NN%`
  - 0% / 无 history / 无 fileHash → `—`（空显示，避免噪点）
- NEXT 标签优先级仍最高，占用右列时不显示进度
- 用 `useLiveQuery` 批量拉 history 记录，构成 `Map<fileHash, {progress,duration}>`

## 1. 数据接入

- [x] 1.1 在 `EpisodeGrid` 内用 `useLiveQuery` 按 `episodes[].fileHash` 批量 `db.history.bulkGet`，构造 `progressMap: Map<fileHash, number>`（值为 0~1 百分比）

## 2. 渲染调整

- [x] 2.1 把 `library-ep-date` 那一列替换为进度文案分支：watched → `✓`、有进度 → `NN%`、其他 → `—`
- [x] 2.2 移除不再使用的 `formatDate` 函数
- [x] 2.3 调整 `library.css` 中 `.library-ep-date` 相关样式：重命名为 `.library-ep-progress` 并适配 `✓` / `NN%` / `—` 三种文案的视觉（等宽数字、watched 用 muted 色）
