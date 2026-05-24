## 背景

调整 library 点击交互，让"播放"和"详情"分得更清晰：
- Hero "继续观看" 按钮 → 直接播放 nextPlayable，不再弹详情
- Hero "详情" 按钮 → 仍弹详情
- LandscapeCard（继续观看横版卡）整张 click → 直接播放 nextPlayable
- PosterCard（所有作品竖版卡）整张 click → 仍弹详情；删除卡片 hover 中央"播放"图标，避免误导用户以为点中央能播放

`pickNextEpisode` 已限制在已导入文件范围，无下一集时返回 undefined；这种情况 fallback 到打开详情，避免点了没反应。

## 1. Hero 与卡片直接播放接线

- [x] 1.1 `library/index.tsx`：新增 `playOrOpen(item)` 工具：若 `pickNextEpisode(item)` 有结果则调 `playEpisode`，否则 fallback `setSelectedAnime(item)`
- [x] 1.2 `library/index.tsx`：Hero 的 `onPlay` 改为调 `playOrOpen(featured)`；`onDetails` 保持 `setSelectedAnime`
- [x] 1.3 `library/index.tsx`：LandscapeCard 的 `onClick` 改为 `playOrOpen(item)`（不再共用 `onCardClick`）

## 2. PosterCard 去掉 hover 中央播放图标

- [x] 2.1 `library/PosterCard.tsx`：删除 `<div className="library-poster-hover">` 整块（含 `library-poster-play` 按钮与 PlayGlyph 调用）；PlayGlyph 函数若变为未引用则一并删除
- [x] 2.2 `styles/library.css`：删除 `.library-poster-hover` / `.library-poster-play` 及相关 hover 选择器
- [x] 2.3 保留卡片整体 hover 的浮起效果（`.library-poster-card:hover .library-poster-art` 的 translate/box-shadow）

## 3. Hero playDisabled 接线

- [x] 3.1 `library/index.tsx`：给 Hero 传 `playDisabled={!pickNextEpisode(featured)}`，按钮在无可播放下一集时禁用

## 4. 验证

- [x] 4.1 `pnpm typecheck` 通过
- [x] 4.2 chrome MCP 截图核对：Hero "继续观看" 按钮直接进 player；LandscapeCard 点击进 player；PosterCard 点击仍开详情，hover 时无中央播放 icon
