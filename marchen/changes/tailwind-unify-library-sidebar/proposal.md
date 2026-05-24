## 动机

项目 UI 当前存在两套样式范式并存：

- **shadcn / 主要业务页** 走 Tailwind 4 utility-first
- **library / sidebar / app-header** 走 bespoke `.css`（~1330 行）

这是历史遗留——library 是按 Infuse 设计稿一气呵成写的，sidebar 跟着同样模式。两套范式的代价已经显现：

- 新人 / 协作者要在两种心智模型之间来回切（看 shadcn 还得切 `library.css` 翻 1100 行）
- token 系统割裂：shadcn 的 `--color-primary` 与 `--library-bg-2` 没有桥
- 改一处样式要决定「这里能直接 className 吗」，每次都需上下文判断
- `library.css` 单文件膨胀到 1154 行，搜索/审阅都笨重

目标：**把样式表达统一到 Tailwind 优先 + CSS 兜底**的混合范式，建立清晰规则，让后续开发不再面对范式选择。

## 变更内容

1. **Token 统一（Tier B）**：把 `--library-*` / `--sidebar-*` / `--app-header-*` 经由 `@theme` 注册成 Tailwind 词典里的命名空间，可直接 `bg-library-bg-2 / text-library-fg-3 / shadow-library-card` 等使用。真值仍留在 `:root / .dark`，只是多了一层映射。
2. **组件迁移（Tier A）**：按组件复杂度分三档逐步迁 className：
   - Tier 1（卡片类，简单原子）：PosterCard / LandscapeCard / Rail / PosterGrid / EmptyState / Sidebar / AppHeader — 完全 Tailwind
   - Tier 2（hybrid）：Hero / EpisodeGrid / LibraryShell — Tailwind 优先，复合选择器/伪元素/keyframes 保留小段 .css（拆到组件目录同级）
   - Tier 3（重，结构留 bespoke）：DetailOverlay — 仅迁文本/间距，banner/poster/scroll 主结构与 keyframes 保留
3. **规则与文档**：在 CLAUDE.md 增补「样式规范」一节，明确「什么时候用 Tailwind / 什么时候保留 .css」的判定准则；后续 AI / 协作者按规则写不再纠结。
4. **CSS 文件治理**：迁完后 `library.css` 1154 行 → 预期 ~300 行（只剩动画 / 复合选择器 / 滚动条 / 渐变）。剩余规则按组件拆到组件目录（Hero.css / DetailOverlay.css / EpisodeGrid.css），跟 .tsx 同级，找样式不用翻大文件。

## 能力

### 新增能力

- `token-system`：定义 `@theme` 命名空间约定、token 注册规范（颜色 / 阴影 / 半径 / 尺寸 / 动画 keyframes 的桥接方式）、保留 CSS var 而非登记 Tailwind 的判断（渐变 / color-mix / 复杂滤镜）
- `component-migration`：分级迁移规则（Tier 1/2/3 划分依据、每档允许的语法、复合状态如 `.watched` 如何迁成 `data-watched`）
- `css-fallback`：哪些场景必须保留 bespoke CSS（keyframes / `:has()` / `::-webkit-scrollbar-*` / 复合状态选择器 / 渐变 token），以及 fallback 的代码组织方式（co-located 在组件目录）

### 修改能力

不修改现有功能能力。本变更仅触及样式表达层，行为完全不变。

## 影响范围

**代码层**：

- `src/renderer/src/styles/tailwind.css`：新增 `@theme` 内 library/sidebar/app-header token 映射
- `src/renderer/src/styles/library.css` / `sidebar.css` / `app-header.css`：删除大部分规则，剩余按组件拆分
- `src/renderer/src/page/library/*.tsx`（约 10 个组件）：className 重写
- `src/renderer/src/components/layout/sidebar/index.tsx` / `app-header/AppHeader.tsx`：className 重写

**不动**：

- shadcn 组件（本就 Tailwind）
- player / settings / shared 业务组件
- main / preload / IPC / 数据库 / player-core 等非 UI 层
- 主题切换机制（dark mode 依赖 `.dark` 覆盖 var 真值，不动 `:root / .dark` 块）

**风险点**：

- 视觉回归——尤其是 dark mode，需逐组件比对
- 长 className 字符串可读性——通过 `cn()` 或必要时 `cva` 缓解
- DetailOverlay 刚修好的滚动 / 动画——只做轻迁移，结构与 keyframes 不动
