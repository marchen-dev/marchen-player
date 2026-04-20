## 1. 配置层清理

- [x] 1.1 删除 `tailwind.css` 中的 `@plugin 'daisyui' { ... }` 配置块
- [x] 1.2 将 `tailwind.css` 的 `@theme` 块中 `cn-primary` → `primary`、`cn-secondary` → `secondary`、`cn-accent` → `accent`（含 `-foreground` 变体）
- [x] 1.3 移除 `package.json` 中的 `daisyui` 依赖，运行 `pnpm install`

## 2. shadcn 组件 cn-* 前缀清理

- [x] 2.1 全局替换 `cn-primary` → `primary`、`cn-primary-foreground` → `primary-foreground`
- [x] 2.2 全局替换 `cn-secondary` → `secondary`、`cn-secondary-foreground` → `secondary-foreground`
- [x] 2.3 全局替换 `cn-accent` → `accent`、`cn-accent-foreground` → `accent-foreground`
- [x] 2.4 验证：搜索 `cn-primary`、`cn-secondary`、`cn-accent` 结果为空

## 3. daisyUI base-* 颜色替换

- [x] 3.1 替换 `bg-base-100` → `bg-background`（Logo.tsx、Settings/index.tsx、Tabs.tsx）
- [x] 3.2 替换 `bg-base-200` → `bg-muted`（Sidebar、DarkMode.tsx、Modal.tsx、Settings/index.tsx、WindowsTitlebar.tsx）
- [x] 3.3 替换 `bg-base-300` → `bg-accent`（Sidebar、Tabs.tsx、FunctionAreaButton.tsx）
- [x] 3.4 替换 `text-base-content` → `text-foreground`（Tabs.tsx）
- [x] 3.5 验证：搜索 `bg-base-100`、`bg-base-200`、`bg-base-300`、`text-base-content` 结果为空

## 4. 主题系统迁移

- [x] 4.1 修改 `providers/index.tsx`：ThemeProvider `themes` 改为 `['light', 'dark']`，`attribute` 改为 `'class'`
- [x] 4.2 修改 `hooks/theme.ts`：`AppTheme` 类型从 `'cmyk' | 'dark' | 'system'` 改为 `'light' | 'dark' | 'system'`
- [x] 4.3 修改 `src/main/tipc/setting.ts`：`AppTheme` 类型同步更新，`input === 'cmyk'` 改为 `input === 'light'`
- [x] 4.4 修改 `DarkMode.tsx`：白天模式 value 从 `'cmyk'` 改为 `'light'`
- [x] 4.5 验证：搜索 `data-theme`、`cmyk` 在 src/ 下结果为空

## 5. Timeline 组件重写

- [x] 5.1 用 flex 横向布局重写 `Timeline.tsx`，移除所有 daisyUI timeline 类
- [x] 5.2 验证：搜索 `timeline-` 在 src/ 下结果为空

## 6. 验证与清理

- [x] 6.1 运行 `pnpm typecheck` 确认无类型错误
- [x] 6.2 运行 `pnpm lint` 确认无 lint 错误
- [x] 6.3 启动 `pnpm dev:web` 检查页面视觉效果（侧边栏、设置弹窗、主题切换、播放器加载页）
