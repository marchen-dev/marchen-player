## 背景

`add-library` 完成了"以作品为单位"的数据模型和写入链路（IndexedDB v3 `library` 表，播放时通过 `history-store` adapter 自动入库）。现状的 UI 是 `RouterLayout` 包裹的卡片 grid + 侧拉 `DetailSheet`，缺乏现代媒体库应用的视觉密度与层次。

本次重写按一份完整的 Infuse 风格 HTML/CSS/JSX 设计稿（位于 `/tmp/design-ref`，包含 `Library.html` / `styles.css` / `app.jsx` / `detail.jsx` / `poster.jsx` / `data.js`）重做视觉与交互层。设计稿的 `data.js` 第一行注释明确写明数据形状"mirrors marchen-player's DB_Library shape"——数据模型 1:1 命中，本变更不动 schema。

约束：

- Marchen 是 Electron + React 19 + Tailwind 4 + shadcn/ui 体系；
- 全局主题已用 `next-themes`（`attribute="class"`），不动；
- 全局 z-index 体系已落在 `lib/constants/z-index.ts` + `styles/shadcn.css`，新组件 MUST 复用；
- 现有 `RouterLayout` 还被 `/latest-anime` 占位页用，不能删；
- Sidebar 还在使用 250px 灰底 + 含文字标签的旧形态，不在本变更范围。

## 目标与非目标

**目标：**

- library 路由 95%+ 还原设计稿的视觉（仅 sidebar 不动是已知割裂）
- 数据模型零变更，写入链路零侵入
- 视觉 token 不污染全局 shadcn 体系，仅在 `[data-page="library"]` 作用域内生效
- 支持 light/dark 两套主题，跟随项目全局切换
- Electron 完整功能，Web 端 library 路由不可达
- 默认窗口宽度调整为 1400，使 ep-grid 默认 4 列

**非目标：**

- Sidebar 改造为 thin icon-only（推迟）
- Window titlebar 改造为玻璃居中（推迟）
- 「新番时间表」/「导入文件夹」/「刷新元数据」/ Accent 自定义 / Tweaks Panel（全部不做）
- Hero 自动轮播 / 多余 Rail（连载中 / 最近添加 / 高分推荐）
- DetailOverlay 内"重新匹配弹幕库"/"清除弹幕缓存"右键菜单（用户去 player setting Sheet）
- 响应式断点适配（为 1280px+ 优化）
- Loading skeleton（IndexedDB 查询 < 50ms，闪烁可接受）

## 决策

### 1. 颜色策略：scoped token + B.1 共用 accent

**决策**：定义一套 library 专属的 CSS 变量（`--library-accent`、`--library-fg-2..4`、`--library-panel-1..3`、`--library-line-1..2`、`--library-glass / glass-strong / scrim`、`--library-done` 等），全部嵌套在 `[data-page="library"]` 选择器下。

**理由**：

- shadcn 默认 `--primary` 是中性黑/白，与设计稿的红橙 accent 语义完全不同；若直接覆盖 `--primary`，会污染全局所有按钮颜色，违反"只重写 library"的范围约束。
- shadcn 只有 2 级 foreground/border 灰阶，无法表达设计稿的 4 级 fg/3 级 panel 信息密度；library scoped 体系补齐。
- 删除按钮与主 CTA 共用 `--library-accent`（方案 B.1，忠于设计稿原意，accent 同时承担"品牌色 + 危险色 + 焦点色"），在 design.md 标注是有意为之。
- 设计稿 `[data-theme='dark']` 选择器统一替换为项目使用的 `.dark`。

**替代方案：**

- 方案 C（全局接受设计稿配色）：违反"只重写 library"，与 1 周前的 `refactor-ui-foundations` 冲突，不可行。
- 方案 A（完全用 shadcn 原色）：丢掉红橙发光感，等于丢掉设计稿灵魂，不可行。

### 2. 布局策略：library 不用 RouterLayout

**决策**：library 自写顶级容器 `LibraryShell`，跳过 `RouterLayout` 的固定标题 + `pt-7` chrome；保留 `RouterLayout` 给 `/latest-anime` 用。

**理由**：

- `RouterLayout` 的设计前提是"固定顶部标题区 + 下方滚动 children"，与设计稿"TopBar sticky 透在 Hero 上方 + Hero 上溢入 TopBar 区域"冲突。
- LibraryShell 同时承担 `data-page="library"` 标记，把 scope 控制收敛到一个组件。

### 3. 渲染分支策略：库为空 / chip 过滤 / Manage 模式 三态

**决策**：library 主区按以下条件渲染：

```
1. shows.length === 0
   → 渲染 EmptyState（图标 + "影视库为空" + "播放动画后会自动入库"）
   → TopBar 仅显示标题，隐藏 search/sort/more

2. managing === true
   → 渲染 TopBar(manage 态) + 一条 Rail（所有作品，含 pick 圆点）
   → 不渲染 Hero / Chips / 其他 Rail

3. filter === 'all' && !search
   → 渲染 TopBar(normal) + Hero + Chips + 继续观看 Rail + 所有作品 Rail
   → "继续观看"为空时不渲染该条

4. filter !== 'all' || search
   → 渲染 TopBar(normal) + Chips + 单条筛选结果 Rail
   → 无 Hero
   → 结果为空时显示"没有匹配项"
```

### 4. z-index 集成到项目体系

设计稿用了散落的硬编码 z-index（30/40/41/50/60/100/101/200）。统一映射到现有变量：

| 设计稿 z-index | 用途              | 映射到                       |
| -------------- | ----------------- | ---------------------------- |
| 30             | TopBar sticky     | 自定（library 内部局部）     |
| 40, 41         | DetailOverlay     | `var(--z-dialog)` = 200      |
| 50             | window-titlebar   | 不做（titlebar 不改）        |
| 60             | sort/more popover | `var(--z-popover)` = 250     |
| 100, 101       | ConfirmDialog     | `var(--z-dialog)` + 1 = 201  |
| 200            | Toast             | `var(--z-toast)` = 300       |

### 5. 拖拽窗口区策略

TopBar 容器节点加 `drag-region` CSS 类，内部按钮（search pill / sort / more / manage 按钮）加 `no-drag-region`。DetailOverlay scrim 与主体也加 `no-drag-region`（避免误拖窗）。这与现有项目（sidebar logo 区 drag-region、按钮 no-drag-region）保持一致。

### 6. 横滚 Rail：scroll-snap + 滚动按钮 + 鼠标滚轮转换

设计稿的 `.rail-track` 用 `scroll-snap-type: x mandatory` + 隐藏原生 scrollbar，trackpad 用户体验流畅，但鼠标用户没法横滚。在 Rail 内监听 `onWheel`：若 `e.deltaY !== 0 && e.deltaX === 0`，调用 `el.scrollLeft += e.deltaY` 并 `preventDefault()`。

滚动按钮（◀ ▶）通过 `scrollLeft / clientWidth / scrollWidth` 计算 `canPrev / canNext`，点击调用 `scrollBy({ left: clientWidth * 0.8, behavior: 'smooth' })`。

### 7. DetailOverlay 自管，不走 ModalStack

DetailOverlay / ConfirmDialog / Toast 都用 React useState + 局部 keydown 监听器自管，不接 `ModalStackProvider`。理由：

- 设计稿的 overlay 不需要"嵌套模态栈"语义；
- 自管能力贴合设计稿动画（fade-in + dt-in cubic-bezier），不被 stack 强加的过渡覆盖；
- ConfirmDialog 在 DetailOverlay 之上时，靠 z-index 数值差（`--z-dialog + 1`）保持正确层叠。

### 8. Hero featured 选择：静态 + 兜底

```ts
const heroShows = shows
  .filter(s => s.watchedCount > 0 && s.watchedCount < s.totalEpisodes)
  .sort((a, b) => new Date(b.lastWatchedAt) - new Date(a.lastWatchedAt))
const featured = heroShows[0] || shows[0]
```

不做轮播，不做 pager / dots。设计稿那部分代码全部删除。

### 9. Web 平台隐藏 library 路由

```
方式 A（路由层 + sidebar 同步过滤）：

router/router.tsx
  ─ siderbarRoutes 数组按 isWeb 过滤 LIBRARY
  ─ router 根级配置：isWeb 时 /library 路径配置 Navigate to /player
  
components/layout/sidebar/index.tsx
  ─ 渲染 NavLinkItem 时复用上面过滤后的 siderbarRoutes
```

理由：URL 也封堵更彻底，未来贡献者不会因看到 library 入口在 Web 缺失而困惑。

### 10. 字体策略

设计稿引入了 Inter + Instrument Serif + JetBrains Mono（Google Fonts CDN）。本变更全部丢掉，使用项目现有 `--ui:` font-family 链（`-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'PingFang SC', 'Noto Sans CJK SC', system-ui, sans-serif`），mono 用 `ui-monospace, 'SF Mono', Menlo, monospace`。理由：

- Marchen 是本地播放器，不应运行时依赖外部 CDN；
- 用户机器多数已安装 SF Pro / Inter / PingFang SC，fallback 视觉差异极小。

### 11. 图片占位与失败回退

`<img>` 标签统一：

```tsx
<img
  src={item.imageUrl}
  loading="lazy"
  onError={(e) => e.currentTarget.dataset.failed = '1'}
  alt={item.title}
/>
```

容器 CSS：

```css
.poster-art { background: var(--library-panel-2); }
.poster-art img[data-failed="1"] { display: none; }
```

加载中是 panel 色块，失败时不破坏布局。Hero backdrop 用同样思路。

### 12. 文件组织

```
src/renderer/src/page/library/
├── index.tsx                  入口，组合各组件 + useLiveQuery + 全局状态
├── LibraryShell.tsx           顶级容器，data-page="library" + 全屏布局
├── Hero.tsx                   静态 hero（含 featured 选择与 backdrop）
├── Chips.tsx                  过滤 chips（含计数）
├── Rail.tsx                   横滚容器 + 滚动按钮 + wheel-to-horizontal
├── PosterCard.tsx             2:3 poster 卡片（多状态徽标）
├── LandscapeCard.tsx          16:9 继续观看卡片
├── TopBar.tsx                 双态（normal / manage）
├── SortMenu.tsx               6 维 sort 弹出菜单
├── MoreMenu.tsx               更多操作菜单（管理 / 全部清空）
├── SearchPill.tsx             search input + ⌘K/✕ 切换
├── DetailOverlay.tsx          全屏覆盖详情页
├── EpisodeGrid.tsx            集数网格（三态 tile）
├── ConfirmDialog.tsx          自管确认对话框
├── Toast.tsx                  自管 Toast 反馈
├── EmptyState.tsx             空库 + 空搜索结果（两种文案）
├── hooks/
│   ├── useFilteredShows.ts    useMemo 封装的过滤/排序逻辑
│   └── useManageState.ts      Manage 模式状态机（selecting/selectedIds/handlers）
└── utils/
    └── shows.ts               派生数据：counts / continueWatching / heroShows
```

设计原则：

- **单一职责**：每个组件只关心自己的渲染与本地状态；跨组件状态通过 props 下传或 hook 抽出；
- **纯函数派生**：所有筛选/排序/计数走 useMemo + 纯函数，便于未来抽测试；
- **数据流单向**：library 数据来源是 `useLiveQuery`，组件不直接调 db，只通过 hook 或 callback 写库；
- **注释覆盖关键决策**：每个组件文件顶部一段中文注释说明它解决什么问题；复杂逻辑（featured 选择、wheel-to-horizontal、Manage 状态机）加行内注释。

### 13. CSS 文件结构

```
src/renderer/src/styles/library.css
├── /* 顶部注释：本文件作用域到 [data-page="library"]，不污染全局 */
├── @layer library tokens { :root[data-page="library"] / .dark [data-page="library"] }
└── @layer library components { .library-* 各组件样式 }
```

由 `styles/main.css` 顶部追加 `@import './library.css';` 引入。

## 风险与权衡

### 已知偏差（接受，不修复）

1. **Sidebar 不动**：dark 模式下 library 主区（深色玻璃）与 sidebar（shadcn muted 浅灰）存在明显割裂；light 模式下偏差较小。预计 dark 还原度约 70%，light 约 80%。

2. **Window titlebar 不改造**：macOS 原生/Windows 自定义 titlebar 与设计稿"38px 玻璃居中"差异保留。

3. **窄窗体验降级**：< 1024 总宽时，ep-grid 退化为 1-2 列，Hero title 可能 wrap 多行。未做响应式优化。

### 性能风险

1. **backdrop-filter 性能**：设计稿大量使用 `backdrop-filter: blur(20px)`（topbar / search-pill / icon-btn / menu / 海报 hover 蒙层）。在大量同屏元素时高 DPI 下可能拖慢渲染。
   - 缓解：blur 严格限制在少数固定元素（hero backdrop / topbar / 弹出菜单），不用在每张 PosterCard 上。

2. **`db.library.toArray()` 全表加载**：对小库（< 100 部）无压力，更大体量时需考虑分页或虚拟列表。暂不优化。

### 兼容风险

1. **`oklch()` / `color-mix()` 颜色函数**：Electron 41 = Chromium 132，全面支持。Web 部署（marchen-play.suemor.com）面向现代浏览器，无需 fallback。

2. **`aspect-ratio` / `backdrop-filter` / scroll-snap**：同上，Chromium 132 全支持。

### 决策风险

1. **B.1（删除按钮与主 CTA 共用 accent）**：用户可能感到"两种红色含义不一"。若用户反馈强烈，后续可单独起 lite 变更切到 `--destructive`。

2. **Web 路由层硬隐藏**：未来若决定给 Web 加 demo 数据，需要回滚此决策（删除 router 过滤与 redirect）。这只是注释级别的提醒，不阻塞本变更。

### 测试与验证

- 视觉验证：chrome-devtools MCP 已配置 attach 模式（`.mcp.json`），各组件实现完成后用 `take_screenshot` 截图比对设计稿；
- 功能验证：手工跑一遍 Manage 流程、Search/Sort/Filter 组合、DetailOverlay 打开/关闭、点击集数跳转播放；
- macOS 实机检查 scroll-snap + overscroll bounce 行为，必要时微调；
- typecheck + lint：`pnpm typecheck && pnpm lint`。
