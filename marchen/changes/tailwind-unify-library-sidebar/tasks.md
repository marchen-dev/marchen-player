## 1. Token 桥接（Tier B）

- [ ] 1.1 全量扫描并清单化所有 `--library-*` / `--sidebar-*` / `--app-header-*` 变量，按类型分组（颜色 / 阴影 / 半径 / 尺寸 / 渐变 / 滤镜）
- [ ] 1.2 `tailwind.css` 的 `@theme` 内新增 library 命名空间颜色映射（`--color-library-bg-2: var(--library-bg-2)` 等所有单色 token）
- [ ] 1.3 `@theme` 内新增 library 阴影映射（`--shadow-library-card` 等）
- [ ] 1.4 `@theme` 内新增 library 半径映射（`--radius-library-card` 等）
- [ ] 1.5 `@theme` 内新增 library 间距映射（`--spacing-rail-card-w` / `--spacing-rail-card-h`）
- [ ] 1.6 `@theme` 内新增 sidebar / app-header 命名空间映射（同上分类处理）
- [ ] 1.7 验证：写一个临时调试组件，使用所有桥接过的 utility，确认亮暗双模式均正确

## 2. Tier 1 组件迁移（全 Tailwind）

- [ ] 2.1 PosterCard.tsx：迁 className，删除 `library.css` 内对应规则
- [ ] 2.2 LandscapeCard.tsx：迁 className，删除对应规则
- [ ] 2.3 Rail.tsx：迁 className，删除对应规则
- [ ] 2.4 PosterGrid.tsx：迁 className，删除对应规则
- [ ] 2.5 EmptyState.tsx：迁 className，删除对应规则
- [ ] 2.6 Sidebar.tsx：迁 className，删除 `sidebar.css` 大部分规则
- [ ] 2.7 AppHeader.tsx：迁 className，删除 `app-header.css` 大部分规则
- [ ] 2.8 视觉验证：截图比对每个 Tier 1 组件的亮 / 暗双模式

## 3. Tier 2 组件迁移（hybrid）

- [ ] 3.1 Hero.tsx：简单属性迁 Tailwind；`::after` 渐变、tag 行的复合状态保留为 `Hero.css`（与 .tsx 同级）
- [ ] 3.2 EpisodeGrid.tsx：将 `.watched / .no-file / .has-file` 等状态从 className 迁到 `data-*`，状态样式用 `data-[xxx]:` variant；保留必要的复合状态规则到 `EpisodeGrid.css`
- [ ] 3.3 LibraryShell.tsx：根容器迁 utility；`:has(> .library-empty)` 等保留为 `LibraryShell.css`
- [ ] 3.4 视觉验证：截图比对 Tier 2 组件

## 4. Tier 3 组件轻迁移（DetailOverlay）

- [ ] 4.1 DetailOverlay.tsx：仅迁文本 / 间距 / 颜色相关 className，banner / scroll-wrap / poster / keyframes / scrollbar 主结构不动
- [ ] 4.2 把保留的 DT 规则从 `library.css` 拆到 `DetailOverlay.css`（与 .tsx 同级），并在 `DetailOverlay.tsx` 顶部 import
- [ ] 4.3 视觉验证 + 滚动行为验证（参考上一变更 `detail-overlay-unified-scroll` 的验证方式）

## 5. CSS 清理与文档

- [ ] 5.1 `library.css` 清理：删除所有已迁移规则，保留 `:root / .dark` token 真值与 `.library-shell` 根容器与跨组件 scrim 相关；确认行数显著下降（目标 < 300 行）
- [ ] 5.2 `sidebar.css` / `app-header.css` 同样清理
- [ ] 5.3 在每个组件级 css 文件（`Hero.css` / `DetailOverlay.css` / `EpisodeGrid.css` / `LibraryShell.css`）顶部加一行注释说明「保留原因」（keyframes / `:has` / scrollbar 等）
- [ ] 5.4 CLAUDE.md 新增「样式规范」节：列出「Tailwind 优先 / CSS 兜底」判定规则、保留 CSS 的 6 个明确场景、co-located 组织方式
- [ ] 5.5 类名冲突防护：grep 确认所有保留的 bespoke class 名仍有 `library-* / sidebar-* / app-header-*` 前缀
- [ ] 5.6 typecheck + lint 通过
- [ ] 5.7 最终视觉回归验证（亮 / 暗双模式遍历所有页面）
