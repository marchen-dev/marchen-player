## 动机

上一轮 `redesign-sidebar-thin` 把 sidebar 收敛成了 72px 黑白灰的 icon rail，但留下一个结构性问题没有解：**macOS 红绿灯（trafficLight）骑在 sidebar 顶部**，sidebar 不得不专门留 56px 空白让位，整体节奏被破坏；而 library 页又自己实现了一条 in-page topbar（标题 + 搜索 + 排序 + 更多），与 sidebar 顶部"留白等于红绿灯"形成两套不一致的"页面顶部"。

正确的拆法是把"窗口框架"和"页面内容"分开：

- **窗口框架**：app 顶部一条全宽 header，专门承载红绿灯让位 + 拖窗 + 1px 分隔线
- **页面内容**：当前页的标题与工具栏 inject 到 header 上，sidebar 与主区从 header 下方齐平开始

这次重构就是把这个分层落地，顺手把 library 的 in-page TopBar 拿掉，迁移到全局 header 槽。

## 变更内容

1. **新增 AppHeader 组件**：全宽 52px（macOS）/ 44px（其他平台），承载红绿灯让位、drag-region、底部 1px 分隔线
2. **新增 PageHeader 注入机制**：jotai atom + `usePageHeader` hook，让 page 把自己的 title 与 actions 注入到 AppHeader 上
3. **RootLayout 改造**：flex 横排 → 2×2 grid（header 跨两列 / sidebar / main），sidebar 与 main 从 header 下方齐平
4. **library TopBar 上提**：library 现有 `TopBar.tsx` 三态（normal / manage / empty）从 page 内部上提到 AppHeader 槽；page 通过 `usePageHeader` 注入 title 与 actions
5. **library hero 视觉适配**：hero banner 顶部 `margin-top: -52px` 渗到 header 下方，配合 AppHeader 透明背景 + blur 蒙版做出 Apple TV+ 那种 cinematic 效果
6. **sidebar 简化**：删除 `.sidebar-top` 红绿灯让位区与 `is-mac` 高度切换；sidebar 从 header 下方齐平开始
7. **player / history 路由**：不注入 header，AppHeader 在这些页面上仅显示空白 drag-region（红绿灯保留）

## 能力

### 新增能力

- `app-header-frame` — AppHeader 自身的尺寸、布局、平台差异、drag-region 与红绿灯让位契约
- `page-header-injection` — page 注入 title/actions 的 atom + hook 契约，含 manage variant 切换、unmount 清理、跨 page 状态隔离
- `library-topbar-upgrade` — library 现有 TopBar 三态拆解到新 header 的迁移契约（含 manage 态、空库态）
- `hero-header-blend` — library hero cinematic 视觉与透明 header 的融合契约
- `layout-grid-restructure` — RootLayout 从 flex 改为 grid 2×2 的结构契约

### 修改能力

无（sidebar 上一轮的契约不变，本次只是删除其顶部让位逻辑，不影响 nav 行为）

## 影响范围

**代码（新增）**：
- `src/renderer/src/atoms/page-header.ts`
- `src/renderer/src/hooks/use-page-header.ts`
- `src/renderer/src/components/layout/app-header/AppHeader.tsx`
- `src/renderer/src/styles/app-header.css`

**代码（修改）**：
- `src/renderer/src/components/layout/root/RootLayout.tsx` — flex → grid
- `src/renderer/src/App.tsx` — 插入 `<AppHeader/>`
- `src/renderer/src/components/layout/sidebar/index.tsx` — 删除 `is-mac` className 与 `sidebar-top` 元素
- `src/renderer/src/styles/sidebar.css` — 删除 `.sidebar-top` 让位逻辑
- `src/renderer/src/page/library/index.tsx` — 改用 `usePageHeader` 注入，删除 `<TopBar/>` 渲染
- `src/renderer/src/page/library/TopBar.tsx` — 三态拆分为 inject 到 header 的 fragment，删除外层 `library-topbar` 容器
- `src/renderer/src/styles/library.css` — hero 顶部 `margin-top: -52px` 与 blur 蒙版调整

**未变更**：
- 主进程 `trafficLightPosition` 保持 `(12, 12)`
- player / history / settings 等其他 page 行为
- IPC / 数据库 / player-core 无关

**风险点**：
- library `TopBar.tsx` 现存 manage 态切换在新机制下是否平滑（atom 瞬切 vs 渐变）
- hero `margin-top: -52` 与 AppHeader 透明叠加在 light/dark 双主题下的色带问题
- player 全屏播放时 AppHeader 是否需要隐藏（结合 fullscreen API）
