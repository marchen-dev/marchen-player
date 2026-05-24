## 1. 基础设施

- [x] 1.1 新建 `src/renderer/src/styles/sidebar.css`：定义 `--sidebar-*` 全套 token（light + .dark 两套），含 bg/fg/panel/line/glass/scrim/accent/accent-glow 等。文件顶部加中文注释说明 scope 与不污染 shadcn 全局
- [x] 1.2 在 `src/renderer/src/styles/main.css` 追加 `@import './sidebar.css';`，确认与已有 `library.css` 并存无冲突
- [x] 1.3 在 `sidebar.css` 内追加组件样式：`.sidebar`（72px 宽，flex column）、`.sidebar-brand`、`.sidebar-nav`、`.sidebar-nav-item`（含 hover / active / icon 尺寸）、`.sidebar-bottom`、active `::before` 红条 + glow、tooltip 样式微调

## 2. Toast 适配 hooks

- [x] 2.1 新建 `src/renderer/src/hooks/use-network-toast.ts`：订阅 `useNetworkStatus`，离线时 `toast({ variant: 'destructive', duration: Infinity, ... })` 并保留 dismiss 句柄，恢复时调 dismiss。仅 Electron 挂载。中文 JSDoc 说明设计意图
- [x] 2.2 新建 `src/renderer/src/hooks/use-update-toast.ts`：订阅 `updateProgressAtom`，downloading 弹/更新进度 toast，ready 切换为含 action 的安装 toast；action 点击复用旧 UpdateProgress 的 localStorage + IPC 行为。仅 Electron 挂载。中文 JSDoc

## 3. Sidebar 组件重写

- [x] 3.1 重写 `src/renderer/src/components/layout/sidebar/index.tsx`：删除旧 250px 布局；改为 72px thin 三段（brand / nav / bottom）。`DownloadClient` export 保留；`NetWorkCheck` / `UpdateProgress` 组件可整段删除（hooks 替代它们）
- [x] 3.2 实现 NavItem 子组件：接收 path + meta，渲染 NavLink + icon + Tooltip（复用 `@renderer/components/ui/tooltip`）；active 状态用 useLocation 判定，加 is-active class。复用过滤后的 `siderbarRoutes`
- [x] 3.3 实现 brand-mark：38×38 容器，渲染 `<Logo />` 或 fallback 字母方块；包成可点击 Link 跳 `/player`；外层 drag-region，内部 button no-drag-region
- [x] 3.4 实现底部设置齿轮：调用 `useSettingModal`；icon 风格与 nav 对齐；外层 no-drag-region
- [x] 3.5 处理 macOS traffic light 位置：sidebar 顶部 brand-mark 向下偏移到 28px 左右，避开 (18, 18) 的 traffic light；用 isMac 条件判定

## 4. 挂载新 hooks

- [x] 4.1 在 `src/renderer/src/App.tsx` 或 `providers/index.tsx`（与 `<IpcListener />` 相邻位置）调用 `useNetworkToast()` 与 `useUpdateToast()`；仅在 `!isWeb` 路径下挂载（与 IpcListener 同步）

## 5. 清理与验证

- [x] 5.1 grep 全项目确认无残留对 `NetWorkCheck` / `UpdateProgress` 的引用（除了 sidebar/index.tsx 内将被删除的部分）
- [x] 5.2 跑 `pnpm typecheck` 与 `pnpm lint`，修复所有 errors
- [x] 5.3 启动 `pnpm dev`，用 chrome MCP attach 截图核对：light/dark 主题、player 路由、library 路由的 sidebar 渲染；library 主区与 sidebar 视觉对齐
- [x] 5.4 macOS 实机验证：traffic light 与 brand-mark 不重叠；拖拽 brand-mark 区域能移动窗口；点击 brand-mark / nav icon / 齿轮均正确触发对应行为
- [x] 5.5 模拟网络断开：关闭 wifi → 检查「网络异常」toast 出现且保持显示；恢复 wifi → toast 自动消失
- [x] 5.6 检查 `Prepare.tsx` 的 web 首次 toast 仍能正常使用 `DownloadClient` action（typecheck 应该已经验证）

## 6. 视觉精调 follow-up（与设计稿对齐）

> 背景：第一版上线后用户反馈"sidebar 太丑"。原因：(1) 设计稿里 M brand-mark 是占位示例不该照搬；(2) 红色 accent 是 library 页私有装饰色，并非项目 primary（项目实际是黑白灰系统），sidebar 不应跟随；(3) macOS 红绿灯 `trafficLightPosition` 之前显式设 `(18,18)` 比原生 app 偏右；(4) active 状态的 `::before` 红条 left:-16px 会被窄 sidebar 切到只剩一道竖线。本组任务做收敛性精调，不改 library 的红。

- [x] 6.1 `src/main/windows/main.ts`：`trafficLightPosition` 从 `(18,18)` 改为 `(12,12)`，与 macOS 原生 app 对齐（已完成）
- [x] 6.2 `src/renderer/src/components/layout/sidebar/index.tsx`：删除顶部 brand-mark 整段（含 `<Link>` + `<span>M</span>`）、相关 `Link` / `RouteName` 未用 import；保留 drag-region 区域用于 macOS 拖窗
- [x] 6.3 `src/renderer/src/styles/sidebar.css`：宽度 96 → 72；删除 `.sidebar-brand` / `.sidebar-brand.is-mac` / `.sidebar-brand-mark` 三个选择器；顶部改用 `.sidebar` 的 `padding-top`，macOS 56 / 其他 18
- [x] 6.4 active 状态去红：删除 `.sidebar-nav-item.is-active::before` 整段；`.is-active` 改为 `background: var(--sidebar-panel-2); color: var(--sidebar-fg)`（fg 即黑/白，不引入 accent）
- [x] 6.5 删除 `--sidebar-accent` / `--sidebar-accent-glow` token（两套主题都删），sidebar 不再有任何红
- [x] 6.6 chrome MCP 截图核对：player 路由 light/dark 两态，确认无 M、active 项只有填充无红条、宽度协调

