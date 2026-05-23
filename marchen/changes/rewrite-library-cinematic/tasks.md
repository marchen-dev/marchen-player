## 1. 基础设施

- [ ] 1.1 新建 `src/renderer/src/styles/library.css`，定义 `[data-page="library"]` 作用域下的 token：accent 红橙、4 级 fg/3 级 panel/2 级 line 灰阶 ramp、glass/glass-strong/scrim、status colors（done/on/warn）、组件尺寸（rail-card-w/h）、桌面背景渐变。light 与 `.dark [data-page="library"]` 两套都写齐。文件顶部加中文注释说明 scope 与不污染全局
- [ ] 1.2 在 `styles/main.css` 顶部追加 `@import './library.css';`，确认其他全局样式不冲突
- [ ] 1.3 修改 `src/main/windows/main.ts`：默认窗口宽度 1200 → 1400（minWidth 800 不变）
- [ ] 1.4 新建 `src/renderer/src/page/library/LibraryShell.tsx`：顶级容器组件，挂 `data-page="library"`，承载子组件、scrollable 主区、与 drag-region 顶部 chrome；文件顶部加中文注释说明它取代 RouterLayout 的原因
- [ ] 1.5 新建 `src/renderer/src/page/library/utils/shows.ts`：纯函数派生 helper（heroShows / continueWatching / counts 计算），加 JSDoc
- [ ] 1.6 新建 `src/renderer/src/page/library/hooks/useFilteredShows.ts`：useMemo 封装的 filter + search + sort 组合逻辑，返回 `{ filtered, counts }`
- [ ] 1.7 新建 `src/renderer/src/page/library/hooks/useManageState.ts`：Manage 模式状态机（selecting / selectedIds / toggleSelect / selectAll / deselectAll / cancelManage / 绑定 ESC 监听），返回结构化对象

## 2. 静态组件与卡片

- [ ] 2.1 新建 `src/renderer/src/page/library/PosterCard.tsx`：2:3 海报卡，支持 normal 与 manage 双态；状态徽标（rating / onair / 已看完 / 在看进度条）；hover 浮起 + 播放按钮蒙层；图片 onError 回退占位
- [ ] 2.2 新建 `src/renderer/src/page/library/LandscapeCard.tsx`：16:9 横向卡，底部进度条与"下一集"标签
- [ ] 2.3 新建 `src/renderer/src/page/library/Rail.tsx`：横滚容器；含 rail-head（标题 / 副标题 / 滚动按钮）；scrollTrack 监听 scroll 更新 canPrev/canNext；onWheel 把垂直 deltaY 转横向 scrollLeft；scroll-snap-type: x mandatory；隐藏 scrollbar
- [ ] 2.4 新建 `src/renderer/src/page/library/Hero.tsx`：静态主推区；接受 featured 作品；渲染 backdrop（imageUrl + 模糊 + 渐变蒙层）+ 标题 + meta + tags + summary + 主 CTA + 进度条；watchedCount === 0 时切换为「开始观看」文案并隐藏进度条；rating === 0 / 空 tags / 空 summary 各自不渲染
- [ ] 2.5 新建 `src/renderer/src/page/library/Chips.tsx`：5 个 chip（全部/在看/连载中/已看完/未开始），含 active 样式与计数

## 3. 顶部工具栏与交互

- [ ] 3.1 新建 `src/renderer/src/page/library/SearchPill.tsx`：input + ⌘K 提示 / ✕ 清除按钮切换；focus 时宽度展开
- [ ] 3.2 新建 `src/renderer/src/page/library/SortMenu.tsx`：6 维 sort 弹出菜单；菜单项含 label + hint + 已选 check 图标
- [ ] 3.3 新建 `src/renderer/src/page/library/MoreMenu.tsx`：仅含「管理 / 批量删除」+ 分隔符 +「全部清空…」（危险样式）；不实现"导入"/"刷新"
- [ ] 3.4 新建 `src/renderer/src/page/library/TopBar.tsx`：normal 与 manage 双态；normal 态布局：标题 + 计数 + SearchPill + sort 按钮 + more 按钮；manage 态：取消按钮 + 选中计数 + spacer + 全选/取消全选 + 删除按钮；空库时仅显示标题；使用 useRef + document mousedown 实现点击外部关闭弹出菜单；同时只允许一个菜单打开；ESC 关闭弹出菜单
- [ ] 3.5 新建 `src/renderer/src/page/library/ConfirmDialog.tsx`：自管对话框（scrim + 居中卡），支持 danger 样式、Enter 确认、ESC 取消；z-index 用 `calc(var(--z-dialog) + 1)`
- [ ] 3.6 新建 `src/renderer/src/page/library/Toast.tsx`：底部居中浮起，2.4 秒自动消失；z-index 用 `var(--z-toast)`

## 4. 详情页与剧集网格

- [ ] 4.1 新建 `src/renderer/src/page/library/EpisodeGrid.tsx`：CSS Grid 布局（auto-fill minmax(280px, 1fr)）；ep-tile 三态（watched/next/no-file）；点击 has-file tile 调 onPlay；剧场版（totalEpisodes === 1）单 tile 占满第一行；空 fileHash 透明度 50% + 不可点击
- [ ] 4.2 新建 `src/renderer/src/page/library/DetailOverlay.tsx`：全屏覆盖（inset:36px）；scrim 蒙层 + 主体；顶部 320px banner backdrop + 浮起 poster；信息区（标题/meta/tags/CTA/进度条/简介）；下方含 EpisodeGrid；右上 ✕ 关闭；点 scrim 关闭；ESC 关闭；onPlay 找到首个未观看且有 fileHash 的剧集，调 navigate(PLAYER, { state: { hash } }) 并关闭
- [ ] 4.3 新建 `src/renderer/src/page/library/EmptyState.tsx`：含图标 + "影视库为空" + 副标题；另导出一个"没有匹配项"变体给搜索结果用

## 5. 主入口与渲染分支

- [ ] 5.1 重写 `src/renderer/src/page/library/index.tsx`：用 LibraryShell 包外层；useLiveQuery 读 library 表；useState 管 search/filter/sort/selected；用 useFilteredShows + useManageState 抽出逻辑；组合 TopBar + Hero + Chips + Rails + DetailOverlay + ConfirmDialog + Toast + EmptyState；保留挂载 `<MatchDanmakuDialog />`
- [ ] 5.2 实现主区渲染分支：空库 → EmptyState；managing → TopBar(manage) + 所有作品 Rail；filter==='all' && !search → Hero + Chips + 继续观看 Rail + 所有作品 Rail；其他 → Chips + 单条筛选结果 Rail；过滤后为空显示"没有匹配项"变体
- [ ] 5.3 Manage 模式：进入后 Hero 不渲染；点击卡片走选择而非打开 detail；删除走 ConfirmDialog → db.library.bulkDelete → showToast；清空走 ConfirmDialog → db.library.clear → showToast

## 6. 路由与 Web 隐藏

- [ ] 6.1 修改 `src/renderer/src/router/router.tsx`：`siderbarRoutes` 在 isWeb 时过滤掉 LIBRARY；router 根级配置：isWeb 时 `/library` 路径配置 `Navigate to /player`
- [ ] 6.2 验证 `src/renderer/src/components/layout/sidebar/index.tsx`：因为 `siderbarRoutes` 已经被过滤，无需在 sidebar 内额外加 isWeb 判断；但需要确认渲染逻辑用的是同一个过滤后的数组（必要时小改）

## 7. 清理与验证

- [ ] 7.1 删除旧文件：`page/library/DetailSheet.tsx`、`page/library/AnimeInfo.tsx`、`page/library/FunctionArea.tsx`、`page/library/LibraryCard.tsx`、`page/library/EpisodeList.tsx`；用 grep 确认无外部引用后再删
- [ ] 7.2 跑 `pnpm typecheck` 与 `pnpm lint`，修复所有报错
- [ ] 7.3 启动 `pnpm dev`，用 chrome-devtools MCP attach 截图核对：dark / light 主题下 EmptyState / Hero + Rails / Chips 过滤 / Search / Sort 弹出 / Manage 模式 / ConfirmDialog / Toast / DetailOverlay / EpisodeGrid 各场景
- [ ] 7.4 在 macOS 实机测试 Rail 横向滚动 + scroll-snap + overscroll bounce 行为，必要时微调 scroll-snap-type 强度
- [ ] 7.5 测试核心交互链路：库为空 → 进 library → 看到 EmptyState；播一个视频自动入库 → 回 library → 看到 Hero + 卡片；点击作品 → DetailOverlay → 点集数 → 跳到 player；批量删除流程；全部清空流程
