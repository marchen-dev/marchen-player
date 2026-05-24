## 背景

LandscapeCard（继续观看横版卡）现在永远显示作品封面 `imageUrl`。但播放过程中 `Event.tsx` 已经用 FFmpeg `grabFrame` 抓了关键帧存到 `db.history.thumbnail`（base64）。本次把 history 里的关键帧接到 LandscapeCard：用 lastWatchedEpisodeId → fileHash → history.thumbnail 链路，找不到则回退 imageUrl。

同时把"下一集 · 第 NN 话"文案改为"续看 · EP NN"，更直观。

## 1. 改造 LandscapeCard 数据通路

- [x] 1.1 `library/index.tsx`：用 `useLiveQuery` 联合查 `db.library` + `db.history`，构造 `thumbnailMap: Map<animeId, string>`（key=animeId, value=lastWatched 集对应的 history.thumbnail）
- [x] 1.2 `library/index.tsx`：将 `thumbnailMap.get(item.animeId)` 作为新 prop `thumbnail` 传给 `<LandscapeCard/>`
- [x] 1.3 `LandscapeCard.tsx`：新增可选 `thumbnail?: string` prop；`<img src>` 使用 `thumbnail ?? item.imageUrl`，找不到自动回退

## 2. 文案改"续看 · EP NN"

- [x] 2.1 `LandscapeCard.tsx`：`下一集 · 第 NN 话` → `续看 · EP NN`（去掉 padStart 也可，EP 后保留 0 填充更整齐）

## 3. 验证

- [x] 3.1 `pnpm typecheck` 通过
- [x] 3.2 chrome MCP 截图核对：已播放过的作品在"继续观看"显示关键帧；未播放过的回退到封面
