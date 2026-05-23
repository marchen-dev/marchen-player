## 动机

一周前刚归档的 `add-library` 完成了"影视库"的基础数据模型与功能闭环（以作品为单位管理观看进度），但 UI 是一个朴素的卡片 grid + 侧拉 DetailSheet。视觉语言上无法与 Infuse / Plex / Apple TV+ 等成熟媒体库应用对齐，缺乏"主作品突出 + 多场景列表 + 沉浸式详情"的层次感。

本次变更在不动数据模型与现有写入链路的前提下，按一份完整的 Infuse 风格设计稿对影视库页面做"骨架级"重写：

- 引入 Hero 区主推一部"继续观看"作品（静态，不轮播）
- 用两条横向 Rail 替代单一 grid（继续观看 landscape + 所有作品 poster）
- 用全屏 DetailOverlay 替代侧拉 DetailSheet
- 加入 TopBar、Chips 过滤、6 维 Sort 菜单等正式媒体库的标配
- 重新定义一套作用域到 library 路由的视觉 token（accent 红橙、4 级灰阶、玻璃叠加层），同时支持 light/dark 两套主题

本变更是"视觉/交互层重写"，不动数据库 schema、不引入新数据源、不改造 Sidebar 或其他路由。

## 变更内容

**重写组件（全部位于 `src/renderer/src/page/library/`）：**

- 重写 `index.tsx` 为新顶级容器（不再使用 `RouterLayout`），承载 TopBar + Hero + Chips + Rails + DetailOverlay
- 新增 `LibraryShell.tsx`：library 路由专用顶级容器，挂 `data-page="library"` 给 token scope 用
- 新增 `Hero.tsx`：静态主推区，含 backdrop、标题、meta、tags、summary、主 CTA、进度条
- 新增 `Chips.tsx`：过滤 chips（全部/在看/连载中/已看完/未开始）
- 新增 `Rail.tsx` + `PosterCard.tsx` + `LandscapeCard.tsx`：横滚列表与两种卡片形态
- 新增 `TopBar.tsx` + `SortMenu.tsx` + `MoreMenu.tsx`：含 search/sort/more 三个区，支持 normal 与 manage 两种态
- 新增 `DetailOverlay.tsx` + `EpisodeGrid.tsx`：全屏覆盖详情页与剧集网格
- 新增 `ConfirmDialog.tsx` + `Toast.tsx`：library 自管的轻量模态/提示组件
- 删除：`DetailSheet.tsx`、`AnimeInfo.tsx`、`FunctionArea.tsx`、`LibraryCard.tsx`、`EpisodeList.tsx`（功能全部融入新组件）

**视觉基础设施：**

- 新增 `src/renderer/src/styles/library.css`：scoped 到 `[data-page="library"]` 的 token 与样式
- 由 `styles/main.css` 引入

**路由与 Web 兼容：**

- 修改 `router/router.tsx`：`siderbarRoutes` 按 `isWeb` 过滤 LIBRARY；直接访问 `/#/library` 在 web 下重定向到 `/#/player`
- 修改 `components/layout/sidebar/index.tsx`：web 下隐藏「影视库」入口

**窗口默认尺寸：**

- 修改 `src/main/windows/main.ts`：默认窗口宽度由 1200 → 1400，让 library 默认渲染 4 列 ep-grid

## 能力

### 新增能力

- `library-page-shell`：library 路由的顶级容器与布局架构，包含主题 scope（`[data-page="library"]`）与 drag-region 处理
- `library-tokens`：scoped 视觉 token 体系（accent 红橙、4 级灰阶 ramp、玻璃叠加层、状态色），light/dark 两套
- `library-hero`：静态 Hero 主推区，含 featured 选择规则、backdrop 渲染、边界字段兜底
- `library-rails`：两条横滚 Rail（继续观看 landscape / 所有作品 poster），含滚动按钮、scroll-snap、wheel-to-horizontal
- `library-poster-card`：海报卡（含评分徽标、On Air 标记、已看完标记、进度条、hover 播放按钮、Manage 模式 pick 圆点）
- `library-landscape-card`：继续观看用的 16:9 横向卡片
- `library-topbar`：含 search / sort / more 三个区，normal 与 manage 两种态切换
- `library-filter-search-sort`：Chips 过滤、search 模糊匹配、6 维 sort 的纯函数逻辑
- `library-manage-mode`：批量选择/删除流程，含 ESC 退出、全选/取消全选、Confirm + Toast
- `library-detail-overlay`：全屏覆盖详情页，含 banner backdrop、浮起 poster、信息区、EpisodeGrid
- `library-episode-grid`：剧集网格（watched/next/no-file 三态），点击播放跳转
- `library-web-hidden`：web 下 library 路由不可达（sidebar 过滤 + URL 重定向）

### 修改能力

- `library-page`（来自 `add-library`）：UI 与布局完全重写，但数据模型、写入链路、播放跳转契约不变

## 影响范围

**代码：**

- 重写：`src/renderer/src/page/library/*`
- 新增：`src/renderer/src/styles/library.css`、`src/renderer/src/components/layout/sidebar/`（小改）
- 修改：`src/renderer/src/router/router.tsx`、`src/renderer/src/styles/main.css`、`src/main/windows/main.ts`
- 删除：旧 library 文件（5 个）

**数据库：**

- 完全不动 `DB_Library` schema
- 不动 `library-writer.ts` 写入逻辑
- 不动 `history-store.ts` 入库适配

**契约不变：**

- 集数点击播放仍走 `navigate(PLAYER, { state: { hash } })`
- 仍挂载 `<MatchDanmakuDialog />` 全局对话框
- `db.library.bulkDelete` / `db.library.clear` 写入路径不变

**已知偏差（写进 design.md，本次不修复）：**

- Sidebar 维持现状（250px + 灰底 + 含文字），dark 模式下 library 主区与 sidebar 存在色调割裂
- Window titlebar 不改造为玻璃居中样式
- Manage 删除按钮与主 CTA 共用 library accent（设计稿原意）
- 为 1280px+ 宽度优化，窄窗下不做响应式断点适配

**平台：**

- Electron：完整功能
- Web：library 路由不可达，无视觉/功能影响
