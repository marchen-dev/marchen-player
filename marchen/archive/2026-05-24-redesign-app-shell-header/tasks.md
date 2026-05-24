## 1. 注入机制基础设施

- [x] 1.1 新增 `src/renderer/src/atoms/page-header.ts`：定义 `PageHeaderState` 类型与 `pageHeaderAtom`（初始 `{ title: null, actions: null, variant: 'default' }`）
- [x] 1.2 新增 `src/renderer/src/hooks/use-page-header.ts`：`usePageHeader(state)` 用 `useLayoutEffect` 在挂载时 set、卸载时 reset；接收 `useMemo` 化的 ReactNode 避免每次渲染重置

## 2. AppHeader 组件

- [x] 2.1 新增 `src/renderer/src/components/layout/app-header/AppHeader.tsx`：读 `pageHeaderAtom`，按三槽布局渲染（traffic-light-spacer / title / actions），variant=manage 时切换为 manage layout
- [x] 2.2 新增 `src/renderer/src/styles/app-header.css`：定义 `--app-header-h`（macOS 52、其他 44）、`.app-header` flex 三槽、`.app-header.is-manage` 变形、底部 1px line、drag-region 整条 + 子元素 no-drag-region
- [x] 2.3 在 `src/renderer/src/styles/main.css` 添加 `@import './app-header.css'`

## 3. RootLayout 与 App 接线

- [x] 3.1 改 `src/renderer/src/components/layout/root/RootLayout.tsx`：根 div 改为 CSS Grid（`grid-template-rows: var(--app-header-h) 1fr; grid-template-columns: var(--sidebar-w) 1fr`），根加 `is-mac` className
- [x] 3.2 改 `src/renderer/src/App.tsx`：在 `<RootLayout>` 内顺序渲染 `<AppHeader/>` → `<Sidebar/>` → `<Content/>`；移除原 `flex` 假设
- [x] 3.3 改 `src/renderer/src/styles/sidebar.css`：删除 `.sidebar-top` 与 `.sidebar.is-mac .sidebar-top`，sidebar 顶部 padding 回到 18px；`.sidebar` 自身 width 改为引用 `var(--sidebar-w)` token
- [x] 3.4 改 `src/renderer/src/components/layout/sidebar/index.tsx`：删除 `<div className="sidebar-top drag-region" />` 元素与 `is-mac` className 注入（drag-region 上提到 AppHeader）

## 4. Library TopBar 上提

- [x] 4.1 改 `src/renderer/src/page/library/TopBar.tsx`：拆分为 `useLibraryHeaderContent(props)` hook，返回 `{ title, actions, variant }` 三段 fragment；不再渲染 `library-topbar` 外层容器
- [x] 4.2 改 `src/renderer/src/page/library/index.tsx`：调用 `usePageHeader(useLibraryHeaderContent(...))`，删除 `<TopBar/>` JSX；保留所有 state hook 与回调
- [x] 4.3 改 `src/renderer/src/styles/library.css`：删除 `.library-topbar` / `.library-topbar-manage` / `.library-manage-spacer` 等容器样式（按钮内部样式如 `.library-icon-btn` 保留）

## 5. Hero / AppHeader 融合

- [x] 5.1 改 `src/renderer/src/page/library/index.tsx`：路由根容器加 `data-page-blend="hero"` 属性（实际加在 LibraryShell）
- [x] 5.2 改 `src/renderer/src/styles/app-header.css`：增加 `[data-page-blend="hero"] .app-header` 透明背景 + backdrop blur（用 :has() 上升根容器）
- [x] 5.3 改 `src/renderer/src/styles/library.css`：`.library-hero` 顶部 `margin-top: calc(-1 * var(--app-header-h))` 与 `padding-top: var(--app-header-h)`；顶部加 10px mask-image 渐隐
- [x] 5.4 light / dark 双主题下检查 title 文字在 hero 上的对比度，必要时在 `.app-header` 半透明背景层加更深的 alpha（半透明 60% + blur 已足够）

## 6. 验证

- [x] 6.1 `pnpm typecheck` 通过
- [x] 6.2 `pnpm lint` 通过（仅剩既有 warnings，无新增 error）
- [x] 6.3 chrome MCP 截图核对：player 路由 empty header / library normal 态 hero blend
- [x] 6.4 macOS 实机：拖拽 header 空白处移动窗口；点击 header 上的搜索/排序/更多按钮正常触发；切换 player ↔ library 路由时 header 不闪烁
- [x] 6.5 检查 sidebar 顶部已不再有 56px 让位空白，与 AppHeader 底部齐平
- [x] 6.6 library hero 顶部在 AppHeader 区域内透出色彩，无明显色带
