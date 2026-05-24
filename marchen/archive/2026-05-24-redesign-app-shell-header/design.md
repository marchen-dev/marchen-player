## 背景

上一轮 sidebar 重设计将 sidebar 收敛为 72px 黑白灰 icon rail，但 macOS 红绿灯仍坐在 sidebar 顶部，sidebar 不得不留 56px 让位空白；同时 library 页有自己的 in-page TopBar，与 sidebar 顶部留白构成"两套页面顶部"。本设计把"窗口框架"与"页面内容"分层：全宽 AppHeader 接管红绿灯让位与拖窗，page 通过注入机制把自己的 title 与 actions 渲染到 AppHeader 上。

当前代码状态：
- `RootLayout.tsx` 仅一个 `flex h-screen` 容器
- `App.tsx` 顺序渲染 `<Sidebar/>` + `<Content/>`
- `library/TopBar.tsx` 是纯 UI 组件（243 行），所有 state 已经在 `library/index.tsx` 顶层
- 主进程 `trafficLightPosition: (12, 12)`，红绿灯右端约 x=60

## 目标与非目标

**目标：**
- 引入 AppHeader 概念，把红绿灯让位、拖窗、底部 1px 分隔线集中到一处
- 提供 page → header 的注入契约，让任意 page 都能把自己的 title 与 actions 渲染到 header
- 把 library 现有 TopBar 三态（normal / manage / empty）平滑迁移到新机制
- RootLayout 重构为 grid 2×2，sidebar 与主区从 header 下方齐平
- library hero 与透明 AppHeader 融合，做出 cinematic 渗入效果

**非目标：**
- 不改主进程 `trafficLightPosition`
- 不重构 sidebar 的 nav 行为（仅删除其顶部让位逻辑）
- 不引入 React Router 的嵌套布局（仍保持 `App + Outlet` 形态）
- 不为 player 路由实现专属 toolbar（player 暂时不注入 header）
- 不处理 player 全屏播放时 header 隐藏（fullscreen 集成是独立话题，留作 follow-up）

## 决策

### 1. 注入机制：jotai atom + `usePageHeader` hook，而非 React Context 或 Portal

**理由**：
- 项目已经广泛依赖 jotai（atoms 目录已有 8+ atom），不引入新概念
- jotai 的 `jotaiStore` 让组件外（如未来的全局快捷键 / main process 菜单）也能读 header 状态
- atom 比 Context 减少 Provider 嵌套层
- Portal 灵活但破坏可预测的渲染顺序，且对 atom 化的 manage variant 切换不友好

**契约形态**：
```ts
type PageHeaderState = {
  title: ReactNode | null
  actions: ReactNode | null
  variant?: 'default' | 'manage'
}
// atoms/page-header.ts
export const pageHeaderAtom = atom<PageHeaderState>({ title: null, actions: null })
// hooks/use-page-header.ts
export function usePageHeader(state: PageHeaderState): void
```

`usePageHeader` 在挂载时 set、卸载时 reset 为 `{ title: null, actions: null }`。

### 2. 渲染顺序：useLayoutEffect 注入，避免一帧空闪

切换路由时旧 page unmount → atom 被 reset → 新 page mount → 重新 set。若用 `useEffect`，中间会有一帧 atom 为 null 的状态导致 header 闪空。改用 `useLayoutEffect` 在 DOM commit 前同步注入；同时 AppHeader 用 React 18 自动批处理，能在同一帧内反映新值。

### 3. RootLayout：CSS Grid 2×2

```css
.root-layout {
  display: grid;
  grid-template-rows: var(--app-header-h) 1fr;
  grid-template-columns: var(--sidebar-w) 1fr;
  height: 100vh;
}
.app-header { grid-column: 1 / -1; grid-row: 1; }
.sidebar    { grid-column: 1; grid-row: 2; }
.main       { grid-column: 2; grid-row: 2; min-width: 0; overflow: auto; }
```

`--app-header-h` 通过 `:root.is-mac` 切换（52px / 44px），`--sidebar-w` 固定 72px。

### 4. AppHeader 平台差异：用 class 而非媒体查询

`isMac` 由 `@renderer/lib/utils.ts` 提供（基于 navigator.userAgent / ipcClient 返回的 platform）。在 RootLayout 根节点加 `is-mac` className，所有平台差异的 CSS 都用 `.is-mac` 选择器，避免运行时 JS 反复算高度。

### 5. AppHeader 内部布局：三槽

```
┌───────────────────────────────────────────┐
│ [traffic-light-spacer] [title]  [actions] │
│   ↑ macOS only           ↑        ↑       │
│   宽度 80px              左对齐    右对齐  │
└───────────────────────────────────────────┘
```

`traffic-light-spacer` 在非 macOS 平台 `display: none`。title 与 actions 之间用 `flex: 1` 撑开。整条 header 设 `-webkit-app-region: drag`，每个 atom 注入进来的 actions 容器外层加 no-drag-region。

### 6. Library TopBar 上提：保留组件，改渲染目标

不删除 `library/TopBar.tsx`，而是把它拆成两半：
- 内部三态各自的 fragment（title fragment + actions fragment）
- library `index.tsx` 调用 `usePageHeader({ title, actions, variant })`，把 fragment 注入

原 `library-topbar` 外层容器 div 删除（容器由 AppHeader 提供）。原 `library/styles/library.css` 里 `.library-topbar` 相关样式删除或迁移到 `app-header.css`。

manage 态通过 `variant: 'manage'`，AppHeader 根据 variant 切换 layout（manage 态隐藏 traffic-light-spacer 之外的左侧 title，改放"取消"按钮 + 选中计数）。

### 7. Hero / AppHeader 视觉融合：sticky transparent + backdrop blur

```
library/index.tsx 路由根容器加 [data-page-blend="hero"] 属性
[data-page-blend="hero"] 时：
  .app-header { background: transparent; }
  .app-header::before { backdrop-filter: blur(20px) saturate(140%); }
  .hero { margin-top: calc(-1 * var(--app-header-h)); padding-top: var(--app-header-h); }
```

切换路由时去掉 `data-page-blend`，AppHeader 回到纯色背景。light / dark 主题下分别用半透明白 / 半透明深色填充，保证 title 文字对比度 ≥ 4.5:1。

### 8. Sidebar 简化

删除 `.sidebar-top`、`is-mac` 高度切换、`sidebar-top` 元素与 `is-mac` className 注入。sidebar 顶部 padding 回到 18px。Drag-region 改由 AppHeader 承担，sidebar 内部全部 no-drag-region。

## 风险与权衡

### 风险 1：manage 态切换瞬切，无过渡动画

**现象**：library 进入 manage 时 AppHeader 整条变形，atom 切换会瞬切。  
**权衡**：上一版 in-page TopBar 也是瞬切的（没有动画），用户已经习惯，不引入新过渡。如果未来需要 crossfade，可以在 AppHeader 内部用 `framer-motion` 的 `AnimatePresence` 做，但本次不做。

### 风险 2：page 切换时 header 一帧空白

**现象**：A page unmount → atom reset → B page mount + set。  
**缓解**：用 `useLayoutEffect`；同时在 `AppHeader` 渲染时，若 atom 为 null fragment，仍渲染骨架（红绿灯让位 + 空 drag-region），避免高度抖动。

### 风险 3：hero blend 在 light 主题色带

**现象**：light 主题下 AppHeader 半透明白，hero 顶部色彩透出来，可能在 AppHeader 与 hero 顶部交界处看到一道淡色带。  
**缓解**：在 AppHeader 用全幅 backdrop-filter 而不是局部，hero 的 margin-top 取负 = AppHeader 高度，让 hero 顶部完全没入 header 区域，没有"交界线"。再用 mask-image 在 hero 自身顶部加上 10px 渐隐做柔化。

### 风险 4：Player 全屏时 AppHeader 不让位

**现象**：xgplayer fullscreen 模式下，video 容器会请求浏览器原生 fullscreen，会脱离 RootLayout，AppHeader 不可见。但 xgplayer 的"伪全屏"（DOM 容器铺满父级）下，AppHeader 仍可见，会挡住视频顶部。  
**缓解**：本次不解决，留给 player 全屏功能的独立 follow-up。当前 player 路由没有全屏交互，影响为 0。

### 风险 5：Web 端 AppHeader 高度调小（44px）后 title 与 actions 是否仍能放下

**现象**：Web 端无红绿灯让位，header 缩到 44px，library 的搜索框（高 32px）+ 排序/更多按钮（直径 32px）放进去后上下 padding 仅 6px，是否够看。  
**缓解**：原 library `library-icon-btn` 已经是 32px 圆形，44px header 上下各 6px 是 macOS native style 的标准 padding（参考 Safari 的 toolbar），可接受。如发现挤，AppHeader Web 端调到 48px 解决。

### 权衡：注入机制 vs slot prop

考虑过另一种方案：让 library 通过 router 的 `<Outlet context={...}>` 把 header 内容传给 RootLayout。但这要求每个路由都参与 prop drilling，且与 router lib 耦合，不如 atom 干净。
