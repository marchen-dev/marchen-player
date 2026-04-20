### 需求: 系统 SHALL 将所有 daisyUI base-* 颜色类名替换为 shadcn 对应类名

映射关系：
- `bg-base-100` → `bg-background`
- `bg-base-200` → `bg-muted`
- `bg-base-300` → `bg-accent`
- `text-base-content` → `text-foreground`

#### 场景: 侧边栏背景色使用 shadcn 类名

WHEN 渲染 Sidebar 组件
THEN 侧边栏容器使用 `bg-muted` 而非 `bg-base-200`
AND NavLink 选中态使用 `bg-accent` 而非 `bg-base-300`

#### 场景: 所有 base-* 类名不再存在于代码中

WHEN 在 `src/renderer/` 目录下搜索 `bg-base-100`、`bg-base-200`、`bg-base-300`、`text-base-content`
THEN 搜索结果为空

---

### 需求: 系统 SHALL 将 shadcn 组件中的 cn-* 前缀恢复为标准命名

移除 daisyUI 后不再有命名冲突，`cn-primary` → `primary`，`cn-secondary` → `secondary`，`cn-accent` → `accent`，以及对应的 `-foreground` 变体。

#### 场景: tailwind.css 中颜色注册使用标准命名

WHEN 查看 `tailwind.css` 的 `@theme` 块
THEN `--color-primary` 替代 `--color-cn-primary`
AND `--color-secondary` 替代 `--color-cn-secondary`
AND `--color-accent` 替代 `--color-cn-accent`
AND 对应的 `-foreground` 变体同样去掉 `cn-` 前缀

#### 场景: 所有 cn-* 前缀类名不再存在于代码中

WHEN 在 `src/renderer/` 目录下搜索 `cn-primary`、`cn-secondary`、`cn-accent`
THEN 搜索结果为空

---

### 需求: 系统 SHALL 处理原本使用 daisyUI primary/secondary 色的组件

移除 daisyUI 后，`text-primary`、`bg-primary`、`text-secondary` 将指向 shadcn 的 CSS 变量值。需确保这些组件的视觉效果合理。

涉及文件：Timeline.tsx、CompleteIcon.tsx、PlayList.tsx、SubtitleImport.tsx、Accordion.tsx

#### 场景: 播放列表高亮色正常显示

WHEN 播放列表中有正在播放的视频
THEN 当前播放项使用 `text-primary` 显示（指向 shadcn primary 值）
AND hover 态使用 `hover:text-primary`

#### 场景: Timeline 进度条高亮色正常显示

WHEN 弹幕加载进度推进
THEN 已完成步骤的连接线使用 `bg-primary`（指向 shadcn primary 值）

---

### 需求: 系统 SHALL 移除 daisyUI 配置和依赖

#### 场景: tailwind.css 不再包含 daisyUI 插件

WHEN 查看 `tailwind.css`
THEN 不存在 `@plugin 'daisyui'` 配置块

#### 场景: package.json 不再包含 daisyui 依赖

WHEN 查看 `package.json` 的 `devDependencies`
THEN 不存在 `daisyui` 条目
