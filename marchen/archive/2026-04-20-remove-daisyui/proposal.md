## 动机

项目同时使用 daisyUI 和 shadcn/ui 两套颜色系统，语义重叠但值不同，导致维护混乱：

- shadcn 的 `primary/secondary/accent` 被迫加 `cn-` 前缀（`bg-cn-primary`）以避免和 daisyUI 冲突
- `text-primary` 和 `text-cn-primary` 指向完全不同的颜色，容易误用
- daisyUI 的实际使用范围很小（`bg-base-*` 背景色 + 1 个 Timeline 组件），但引入了整套主题系统的复杂度
- 后续计划迁移 Turborepo，统一颜色系统可以减少拆包时的复杂度

## 变更内容

移除 daisyUI 依赖，统一到 shadcn CSS 变量颜色系统：

- 移除 `@plugin 'daisyui'` 配置和 `daisyui` npm 包
- 将 daisyUI 的 `bg-base-100/200/300`、`text-base-content` 替换为 shadcn 对应的颜色类名
- 将 shadcn 组件中的 `cn-primary/cn-secondary/cn-accent` 前缀恢复为标准命名
- 处理 `text-primary`、`bg-primary` 等直接使用 daisyUI primary 色的地方
- 主题系统从 `cmyk/dark` + `data-theme` 切换到 `light/dark` + `class`
- 用 flex 布局重写 Timeline 组件，替代 daisyUI 的 timeline 类

## 能力

### 新增能力

- `color-migration`：将 daisyUI 颜色类名迁移到 shadcn CSS 变量体系，包括 base-\* 替换和 cn-\* 前缀清理
- `theme-system-cleanup`：主题系统从 daisyUI 的 cmyk/dark 切换到标准 light/dark，清理 data-theme 属性
- `timeline-rewrite`：用纯 Tailwind flex 布局重写 Timeline 组件

### 修改能力

无

## 影响范围

- 样式配置：`tailwind.css`、`shadcn.css`
- UI 组件：Button、Badge、Tooltip、Checkbox、Progress、DropdownMenu、Select、Toggle、Slider、Switch、ContextMenu、Sheet、toast（~13 个 shadcn 组件的 cn-* 前缀）
- 业务组件：Sidebar、Tabs、Modal、Settings、WindowsTitlebar、Logo、DarkMode、FunctionAreaButton（8 个 base-* 替换）
- 播放器相关：Timeline、CompleteIcon、PlayList、SubtitleImport、Accordion（5 个 daisyUI primary/secondary 用法）
- 主题系统：providers/index.tsx、hooks/theme.ts、src/main/tipc/setting.ts
- 依赖：移除 daisyui 包
