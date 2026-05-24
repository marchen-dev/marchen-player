## 背景

围绕 `lastWatchedEpisodeId` 这条新数据通路，修复多处「看了一会但 UI 显示 0%」+「NEXT 抢位」相关问题：

- `ctaLabel` 仍按 `watchedEpisodeIds.length === 0` 判定首播，导致已有 lastWatched 也显示「开始观看」
- `EpisodeGrid` 的 NEXT 与单集进度争用右列；信息已被 Hero CTA 显化，列表层冗余且抢位 → 直接取消
- LandscapeCard / Hero 显示 anime-level 完成度（看完集数 / 总集数），与"我看了多少"的直觉不符 → 改用单集进度
- PosterCard 的 EP 徽章在 NEXT 取消后语义重复 → 同步删除

`library/index.tsx` 已有 thumbnailMap 的 useLiveQuery 拉 history，顺便扩展返回 `progressMap: Map<animeId, { episodeNumber, ratio }>`，子组件纯展示。

## 1. 核心修复

- [x] 1.1 `selectors.ts`：`ctaLabel` 判定改为 `watchedEpisodeIds.length === 0 && !lastWatchedEpisodeId` 才走「开始观看」
- [x] 1.2 `EpisodeGrid.tsx`：删除 `nextEpisodeId` / `isNext` / NEXT 三元渲染，右列统一渲染 `library-ep-progress`
- [x] 1.3 `library.css`：删除 `.library-ep-tile.is-next`、`.library-ep-tile.is-next .library-ep-num`、`.library-ep-next-pill` 样式

## 2. UI 一致性

- [x] 2.1 `library/index.tsx`：把 thumbnailMap 那个 useLiveQuery 扩展为同时计算 `progressMap: Map<animeId, { episodeNumber: number, ratio: number }>`（取 lastWatched 集的 history 进度比例），下发给 LandscapeCard
- [x] 2.2 `LandscapeCard.tsx`：新增 `episodePct?: number` / `episodeNumber?: number` props，副标显示「第 NN 话 · NN%」，进度条按 ratio 渲染；无数据回退到「即将开始」并隐藏进度条
- [x] 2.3 `PosterCard.tsx`：删除 `library-next-badge` 渲染分支与对应 `pickNextEpisode` 引用，保留底部 anime-level 完成度小进度条
- [x] 2.4 `library.css`：删除 `.library-next-badge` 样式

## 3. Hero 进度

- [x] 3.1 `library/index.tsx`：把 progressMap 也传给 Hero（或单独算 featuredPct）
- [x] 3.2 `Hero.tsx`：进度条 + 文案改为「上次到 第 NN 话 · NN%」（基于 lastWatched 集的单集进度），无数据时隐藏进度行
