## 动机

`rewrite-library-cinematic` 完成了影视库页面的视觉重写（深色玻璃 + 红橙 accent），但 sidebar 仍保留 250px 灰底 + 含文字标签 + 底部多组件的旧形态。两者并存导致明显的左右视觉割裂：

- 配色断层：library 用 oklch 红橙 + 深色玻璃，sidebar 用 shadcn neutral 灰
- 饱和度断层：library 高饱和有 glow，sidebar 平面无 accent
- 信息密度浪费：250px 宽 sidebar 只放了 2 个 nav 项，横向空间利用率极低
- 在 dark 模式下尤其明显，整个窗口呈"右半边精致、左半边粗糙"

本次变更按设计稿原意，把 sidebar 重做为 **72px thin icon-only** 形态：纵向 brand-mark + icon nav + 设置齿轮，跨路由统一应用。同时把原本挤在 sidebar 底部的网络异常与更新进度提示统一改走 Toast。

## 变更内容

**重写组件：**

- 重写 `src/renderer/src/components/layout/sidebar/index.tsx` 为 thin 形态
  - 72px 宽，纵向布局：brand-mark / nav icon 列表 / 底部齿轮
  - 复用 shadcn Tooltip 显示 nav 项中文标题
  - NavLink active 样式：左侧 3px accent 红条 + glow + 背景轻填
  - 顶部 brand-mark 区域保留 drag-region（macOS 拖窗）
  - DownloadClient 不再渲染在 sidebar 里，但保留 export 给 `Prepare.tsx` 的 toast 使用

**新增视觉基础设施：**

- 新增 `src/renderer/src/styles/sidebar.css`：sidebar 专属 token + thin 布局样式
  - 跟随项目全局 `.dark` 切换
  - dark：rgba 玻璃 + backdrop-blur；light：纯白面 + 细边线

**新增状态 → Toast 适配器：**

- 新增 `src/renderer/src/hooks/use-network-toast.ts`
  - 监听 `useNetworkStatus`，离线时弹"网络异常"持续 toast，恢复后清除
- 新增 `src/renderer/src/hooks/use-update-toast.ts`
  - 监听 `updateProgressAtom`，downloading 时弹进度 toast，ready 时弹含「安装新版本」action 的 toast

**Provider 挂载：**

- 在 `src/renderer/src/providers/index.tsx` 或 `App.tsx` 内（Electron 路径下）调用两个新 hook，让网络/更新通知全局生效

**样式注册：**

- `src/renderer/src/styles/main.css` 增加 `@import './sidebar.css';`

## 能力

### 新增能力

- `sidebar-thin-shell`：72px thin sidebar 容器与布局架构（brand-mark / nav / settings 三段、drag-region 处理、跨路由一致）
- `sidebar-tokens`：sidebar 专属视觉 token（dark 玻璃 / light 白面、accent 红条、tooltip 样式），跟随项目全局主题
- `sidebar-nav-item`：icon-only nav 项渲染（icon + hover tooltip + active 红条 + hover panel 填充）
- `sidebar-web-nav-filter`：复用现有 `siderbarRoutes` 已经按 isWeb 过滤的输出，thin sidebar 下 Web 端只渲染「视频播放」一项
- `network-toast`：替代原 sidebar 内 `NetWorkCheck` 的全局 toast 适配器，根据网络状态触发/清除提示
- `update-toast`：替代原 sidebar 内 `UpdateProgress` 的全局 toast 适配器，downloading / ready 两种态分别触发不同 toast

### 修改能力

- `sidebar`（来自 `add-library` / 早期变更）：从 250px 含文字版本重做为 72px thin 版本，跨所有路由生效
- `network-status-feedback`：从 sidebar Alert 改为全局 Toast
- `update-progress-feedback`：从 sidebar 进度条 / 按钮改为全局 Toast

## 影响范围

**代码：**

- 重写：`src/renderer/src/components/layout/sidebar/index.tsx`
- 新增：
  - `src/renderer/src/styles/sidebar.css`
  - `src/renderer/src/hooks/use-network-toast.ts`
  - `src/renderer/src/hooks/use-update-toast.ts`
- 修改：
  - `src/renderer/src/styles/main.css`（@import）
  - `src/renderer/src/providers/index.tsx` 或 `App.tsx`（挂载 toast hooks）

**契约保留：**

- `DownloadClient` 组件保留 export（`Prepare.tsx` 仍依赖）
- `useSettingModal` 调用路径不变（齿轮按钮点击仍调用它打开设置）
- `siderbarRoutes` 过滤逻辑（isWeb / Electron 分支）不动
- `useNetworkStatus` / `updateProgressAtom` 数据源不动，仅消费方式从 component 改为 hook + toast

**影响的其他页面（视觉副作用）：**

- player 路由：左侧 sidebar 从 250px 变 72px，主区获得 178px 额外宽度
- library 路由：左右色调对齐，视觉割裂消除
- 设置面板：齿轮入口位置从 sidebar 顶部右上移到 sidebar 底部
- 全局：250px 浪费的横向空间归还主区

**不动：**

- shadcn 全局 token 体系
- `RouterLayout`（latest-anime 仍用）
- 路由表 / 数据库 / IPC

**已知偏差（写进 design.md，本次不修复）：**

- icon-only sidebar 下 Windows 用户首次接触会有学习成本（中文 tooltip 缓解）
- 网络异常 / 更新通知从"持续可见的固定区域"改为"瞬时 toast"，存在感会下降；如果用户错过 toast 需要去设置面板查更新
