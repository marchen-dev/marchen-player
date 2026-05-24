## 背景

`rewrite-library-cinematic` 重写了 library 页面的视觉（深色玻璃 + 红橙 accent），但 sidebar 维持旧形态（250px 灰底 + 含文字标签 + 底部 NetWorkCheck/UpdateProgress/DownloadClient）。在 dark 模式下这导致明显的左右割裂；横向空间也被 sidebar 浪费了 178px。

本次按设计稿原意，把 sidebar 重做为 72px thin icon-only，跨所有路由统一应用。同时把 sidebar 底部的多个状态组件从"持续可见"改为"按需 Toast"，腾出 sidebar 的纵向空间。

约束：

- `siderbarRoutes` 已在 `router/router.tsx` 内按 isWeb 过滤 LIBRARY，本变更直接消费过滤后的数组；
- `DownloadClient` 仍被 `Prepare.tsx` 的 web 首次 toast 引用，组件 export MUST 保留；
- 项目已经在用 shadcn 的 `useToast`（`Prepare.tsx` 已经在用），不需要新依赖；
- macOS 用 `hiddenInset` 标题栏，sidebar 顶部必须支持 drag-region；
- Windows 用自定义 Titlebar（`components/modules/app/WindowsTitlebar.tsx`），sidebar 与之相邻不冲突。

## 目标与非目标

**目标：**

- sidebar 减到 72px，跨路由保持一致视觉
- dark 模式下 sidebar 与 library 主区色调统一（消除左右割裂）
- light 模式下 sidebar 纯白面，简洁不喧宾夺主
- 网络异常 / 更新进度通知改 Toast，sidebar 内完全没有"状态区"
- 不破坏 `Prepare.tsx` 等其他位置对 `DownloadClient` 的复用
- 视觉跟随项目全局 `next-themes` 主题切换

**非目标：**

- 不改 router / 路由表（`siderbarRoutes` 复用其过滤结果）
- 不改 IPC / atom / database
- 不重写 `Settings → About` 的现有「下载客户端」入口
- 不实现"展开/收起"动画的 sidebar（thin 永远 72px，不可切换宽度）
- 不在 sidebar 内显示任何文字标签（icon-only + tooltip）

## 决策

### 1. 视觉作用域：sidebar 专属 token，不污染 shadcn

**决策**：在 `src/renderer/src/styles/sidebar.css` 内定义 `--sidebar-bg / --sidebar-fg / --sidebar-fg-2 / --sidebar-panel / --sidebar-line / --sidebar-glass / --sidebar-accent / --sidebar-accent-glow` 等。

**理由**：

- shadcn `--background` / `--foreground` / `--primary` 仍然为黑/白中性，不能直接用作设计稿的红橙 accent
- 与 library scope 不共享 token：library 的 `--library-*` 作用于 `[data-page="library"]` 内部，sidebar 在 scope 外；让 sidebar 用自己一套保证两者跨路由都生效
- 命名一致性：用 `--sidebar-*` 前缀清晰表达作用域
- 跟随 `<html class="dark">` 自动切换 light / dark 两套值

### 2. 布局策略：CSS Grid + flex 三段

```
.sidebar (72px wide)
  display: flex; flex-direction: column;
  ├── .sidebar-brand (38px brand-mark, drag-region)
  ├── .sidebar-nav   (flex: 1, no-drag-region, 含若干 NavItem)
  └── .sidebar-bottom (no-drag-region, 含设置齿轮)
```

- drag-region 仅覆盖 brand 区域上方空白；nav 与 bottom 全部 no-drag-region
- 不复用现有 `bg-muted px-3 pt-2.5` 等 Tailwind 类，全部由 sidebar.css 接管

### 3. NavItem 实现：复用 shadcn Tooltip

**决策**：tooltip 直接用项目现有的 `@renderer/components/ui/tooltip`（shadcn 包装的 Radix）。

**理由**：

- 避免自写浮层踩 z-index / portal / 点击外部关闭等坑
- shadcn Tooltip 已与项目主题、z-index 体系集成（`--z-tooltip`）
- 一致性：未来其他组件用 tooltip 也是同一个组件
- 缺点：tooltip 样式不能 100% 还原设计稿；接受偏差

### 4. NetWorkCheck → Toast 适配

**决策**：新建 `hooks/use-network-toast.ts`，订阅 `useNetworkStatus`，离线时调用 `useToast()` 的 `toast()` 并保留返回的 `dismiss` 句柄；恢复时调用 dismiss。

```ts
// 伪代码骨架
const { toast } = useToast()
const status = useNetworkStatus()
const dismissRef = useRef<(() => void) | null>(null)
useEffect(() => {
  if (status === false) {
    const t = toast({
      title: '网络异常',
      description: '请检查网络连接',
      variant: 'destructive',
      duration: Infinity, // 持续显示
    })
    dismissRef.current = t.dismiss
  } else {
    dismissRef.current?.()
    dismissRef.current = null
  }
}, [status])
```

**理由**：

- shadcn toast 返回的 `dismiss()` 能主动清除，避免残留
- `duration: Infinity` 让 toast 在网络恢复前一直显示，达到"持续可见"效果
- 不弹"已恢复"toast，避免打扰

### 5. UpdateProgress → Toast 适配

**决策**：新建 `hooks/use-update-toast.ts`，订阅 `updateProgressAtom`，根据 status 切换三种行为：

```
status === 'downloading'：
  - 首次：toast({ title: '正在下载新版本', description: 'N%', duration: Infinity })
    记录返回的 update 句柄
  - 后续 progress 变化：用 update 句柄修改同一条 toast 的 description

status === 'downloaded' / 等价 ready 态：
  - dismiss 旧 toast
  - 弹新 toast：含 action 按钮「安装新版本」
  - 点击按钮：写 localStorage 后调 ipcClient?.app.installUpdate()
```

**理由**：

- shadcn toast 支持 `update()` 在同一条 toast 上更新内容
- 复用旧 `UpdateProgress.tsx` 的 install 行为（localStorage 写入 + IPC 调用），不引入新逻辑
- 仅在 Electron 挂载（Web 无 auto-update）

### 6. 挂载点：根 Provider

**决策**：两个新 hook 在 `App.tsx` 或 `providers/index.tsx` 的 Electron 路径下挂载一次（与现有 `<IpcListener />` 相邻），不依赖任何具体路由。

理由：sidebar 内部已经不渲染 NetWorkCheck / UpdateProgress 组件了；这些通知是全局应用级行为，必须挂在根级让其在任何路由下都触发。

### 7. DownloadClient 的归宿

**决策**：保留 `DownloadClient` export，但从 sidebar 移除。`Prepare.tsx` 的 web 首次 toast action 仍可继续引用。

- Settings → About 已有同等下载入口（按 add-library 等前置变更行为推测），不在本变更范围内验证或新增；如果 review 时发现缺失，单独起 lite 补
- 不在 sidebar 内任何位置显示 DownloadClient

### 8. 主题切换的兼容

next-themes 用 `attribute="class"`，sidebar.css 用 `.dark .sidebar { ... }` 选择器即可与全局保持同步。

### 9. drag-region / no-drag-region

```
.sidebar-brand          → drag-region
  内部 brand-mark 按钮  → no-drag-region（让点击跳 /player 可用）
.sidebar-nav            → no-drag-region
.sidebar-bottom         → no-drag-region
```

### 10. icon 与 active 指示器实现

**决策**：

- icon：复用项目现有的 mingcute icon class（`icon-[mingcute--video-camera-line]` 等），保持与全局图标体系一致
- active 指示器：用 `::before` 伪元素画 3px 红条 + box-shadow 模拟 glow

```css
.sidebar-nav-item.is-active::before {
  content: '';
  position: absolute; left: 0; top: 14px; bottom: 14px;
  width: 3px;
  background: var(--sidebar-accent);
  box-shadow: 0 0 8px var(--sidebar-accent-glow);
  border-radius: 0 3px 3px 0;
}
```

### 11. 文件组织

```
src/renderer/src/components/layout/sidebar/index.tsx
  - 重写为 thin 形态
  - 内部仍包含 DownloadClient 的 export（保持引用兼容）
  - 移除 NetWorkCheck / UpdateProgress 的渲染（这两个组件可直接删除，
    因为 Prepare 用 toast，sidebar 用 hook，新世界不再需要旧组件）

src/renderer/src/styles/sidebar.css   新增
src/renderer/src/styles/main.css      追加 @import './sidebar.css'

src/renderer/src/hooks/use-network-toast.ts  新增
src/renderer/src/hooks/use-update-toast.ts   新增

src/renderer/src/providers/index.tsx 或 App.tsx 内
  挂载两个新 hook（Electron 路径下）
```

## 风险与权衡

### 学习成本

- icon-only 对 Windows / Linux 用户首次使用有学习成本，靠 tooltip 缓解
- 设置入口从 sidebar 顶部右上移到底部齿轮，原用户需要重新定位
- 缓解：第一版可在 release notes 提一句

### 通知存在感下降

- NetWorkCheck 从持续 Alert 改为持续 toast（duration: Infinity），存在感约等于
- UpdateProgress downloading 持续 toast 也类似
- UpdateProgress ready 状态如果用户错过 toast，需要进入 Settings → About 查更新按钮
- 缓解：toast 是项目已有交互，用户已经熟悉

### 跨平台一致性

- macOS：sidebar 上方与 traffic light 区域重叠区设计稿是玻璃 titlebar；本次不改 titlebar，traffic light (18, 18) 仍会盖在 brand-mark 上方
- 缓解：brand-mark 位置略微下移（top 18px → top 28px 之类），避开 traffic light

### Web 端 sidebar 可空感

- Web 端只有「视频播放」一个 nav 项，sidebar 看起来很空
- 但 sidebar 仅 72px 宽，单 icon 也不显得突兀
- 接受这个空感，不强行加占位

### 测试与验证

- 视觉验证：用 chrome-devtools MCP 在 Electron 下截图 light / dark / 各路由
- 功能验证：手动测网络断开（关闭 wifi 后看 toast）、检查更新（mock atom 状态）、点击 sidebar 各 nav 与齿轮
- typecheck + lint
- macOS 实机验证 traffic light 与 brand-mark 不重叠
