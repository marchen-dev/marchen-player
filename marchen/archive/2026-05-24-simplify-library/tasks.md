## 背景

砍掉 library 的搜索 / 排序 / 更多 / Chips 过滤 / 管理模式 等"功能式"能力，让 library 变回纯展示页：Hero + 继续观看 (横滚, max 10) + 所有作品 (竖向 grid, max 50)。
顺手做结构收缩：删 hooks/ 与 utils/ 空目录，TopBar.tsx 内联到 index.tsx，utils/shows.ts 移到 library/selectors.ts。

排序方面：所有作品按 updatedAt 倒序；继续观看沿用既有 pickContinueWatching 逻辑。超出 50/10 直接不展示且不提示。

## 1. 删除右侧 actions（搜索 / 排序 / 更多）

- [x] 1.1 删除文件：`src/renderer/src/page/library/SearchPill.tsx`、`SortMenu.tsx`、`MoreMenu.tsx`
- [x] 1.2 删除 `src/renderer/src/styles/library.css` 中与这三个组件相关的样式段

## 2. 删除 manage 模式

- [x] 2.1 删除文件：`src/renderer/src/page/library/ConfirmDialog.tsx`、`Toast.tsx`、`hooks/useManageState.ts`
- [x] 2.2 `PosterCard.tsx` 去掉 `managing` / `selected` props 与对应的选中态 UI / className
- [x] 2.3 `library/index.tsx` 删除 confirm / toast state、`onDeleteSelected` / `onClearAll` 回调、`ConfirmDialog` / `Toast` 渲染、useManageState 调用
- [x] 2.4 删除 `library.css` 中 manage 态相关样式（按钮、选中态、删除按钮等）

## 3. 删除 Chips 过滤与 useFilteredShows

- [x] 3.1 删除 `src/renderer/src/page/library/Chips.tsx`
- [x] 3.2 删除 `src/renderer/src/page/library/hooks/useFilteredShows.ts`，index 不再调用，直接用原始 shows
- [x] 3.3 删除空的 `hooks/` 目录
- [x] 3.4 删除 `library.css` 中 chips 相关样式段

## 4. 所有作品改 grid（max 50）；继续观看 max 10

- [x] 4.1 新增 `src/renderer/src/page/library/PosterGrid.tsx`：CSS Grid 容器（`auto-fill minmax(184px, 1fr)`），渲染 PosterCard 列表
- [x] 4.2 `library/index.tsx` 默认分支：继续观看 `.slice(0, 10)`，所有作品 `.slice(0, 50)`，改用 `<PosterGrid/>` 取代第二个 `<Rail/>`
- [x] 4.3 `library.css` 加 `.library-poster-grid` 样式；保留 `.library-rail-*` 样式给继续观看用

## 5. 结构收缩

- [x] 5.1 删除 `TopBar.tsx`，`useLibraryHeader` 逻辑（瘦身后只剩 ~5 行）内联到 `library/index.tsx`
- [x] 5.2 把 `utils/shows.ts` 移到 `library/selectors.ts`，更新 import；删除空的 `utils/` 目录
- [x] 5.3 `library/index.tsx` 渲染分支简化为 empty / default 两种；删除 filtered 分支与 `filterLabel` / `filterSub` 辅助函数
- [x] 5.4 `pnpm typecheck` 与 `pnpm lint` 通过
- [x] 5.5 chrome MCP 截图核对：library 路由显示 hero + 继续观看 + 所有作品 grid，AppHeader 右侧无 actions
