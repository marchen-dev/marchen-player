## 背景

项目使用 Tailwind CSS 4 + daisyUI 5 + shadcn/ui 三层样式体系。daisyUI 提供主题色（cmyk/dark）和少量组件类，shadcn 提供 Radix UI 组件的样式。两套系统的 `primary/secondary/accent` 语义重叠但色值不同，shadcn 被迫用 `cn-` 前缀避让。

当前颜色来源：
- `bg-base-100/200/300`、`text-base-content` → daisyUI 主题色
- `text-primary`、`bg-primary` → daisyUI 主题色（cmyk 蓝）
- `bg-cn-primary`、`text-cn-primary` → shadcn CSS 变量（灰黑）
- `bg-background`、`text-foreground`、`bg-muted` 等 → shadcn CSS 变量

## 目标与非目标

**目标：**
- 移除 daisyUI 依赖，只保留 shadcn CSS 变量一套颜色系统
- 恢复 shadcn 标准命名（去掉 `cn-` 前缀）
- 主题切换从 `data-theme` + `class` 双属性简化为仅 `class`
- 保持视觉效果基本一致

**非目标：**
- 不重新设计颜色体系或品牌色
- 不调整 shadcn.css 中的 CSS 变量值（使用现有值）
- 不重构组件结构，仅替换类名

## 决策

### D1: base-* 颜色映射

```
bg-base-100 → bg-background    （最浅层背景）
bg-base-200 → bg-muted         （次级背景）
bg-base-300 → bg-accent        （强调背景）
text-base-content → text-foreground
```

理由：shadcn 的 `background/muted/accent` 在语义上与 daisyUI 的 `base-100/200/300` 层级对应。

### D2: cn-* 前缀清理策略

在 `tailwind.css` 的 `@theme` 块中：
- `--color-cn-primary` → `--color-primary`
- `--color-cn-secondary` → `--color-secondary`
- `--color-cn-accent` → `--color-accent`
- 对应的 `-foreground` 变体同理

然后全局替换所有组件中的 `cn-primary` → `primary`、`cn-secondary` → `secondary`、`cn-accent` → `accent`。

理由：daisyUI 移除后不再有命名冲突，恢复标准命名减少认知负担。

### D3: daisyUI primary 用法处理

移除 daisyUI 后，`text-primary` / `bg-primary` 将指向 shadcn 的 `--primary`（亮色模式下为深灰 `0 0% 9%`，暗色模式下为浅灰 `0 0% 98%`）。

这些用法（PlayList 高亮、Accordion hover、SubtitleImport hover、Timeline 进度、CompleteIcon）在 daisyUI 下是 cmyk 蓝色，迁移后变为 shadcn 的 primary 色。视觉上从"蓝色高亮"变为"前景色高亮"，风格更统一素净。

### D4: 主题系统

- ThemeProvider：`themes={['light','dark']}`，`attribute='class'`
- AppTheme 类型：`'light' | 'dark' | 'system'`
- main 进程 setTheme：`input === 'light'` → `nativeTheme.themeSource = 'light'`
- DarkMode 组件：白天模式 value 从 `'cmyk'` 改为 `'light'`

### D5: Timeline 重写

用 flex 横向布局替代 daisyUI timeline 类。结构：外层 `flex items-center`，每个步骤是 `flex-col items-center`（圆形图标 + 文字），步骤之间用 `div` 做连接线。保留 `CompleteIcon` 组件和高亮逻辑不变。

## 风险与权衡

- **视觉差异**：`text-primary` 从 cmyk 蓝变为深灰/浅灰，播放列表和 hover 效果会有明显变化。如果后续觉得不满意，可以在 `shadcn.css` 中调整 `--primary` 的值，不需要改组件代码。
- **遗漏风险**：daisyUI 可能通过 CSS 注入了一些全局样式（如 reset、base 样式），移除后可能有细微的排版差异。需要在移除后全面检查页面。
- **Timeline 布局**：daisyUI 的 timeline 有上下交替排列（`timeline-start`/`timeline-end`），重写时简化为纯横向排列，文字统一在图标下方。
