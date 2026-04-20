# 移除 daisyUI 调研

## 现状

项目同时使用 daisyUI 和 shadcn 两套颜色系统，语义重叠但值不同，导致 CSS 混乱。

## daisyUI 实际使用范围

| 用途 | 类名 | 文件数 |
|------|------|--------|
| 背景色层级 | `bg-base-100/200/300` | 7 |
| 文字色 | `text-base-content` | 1 |
| Timeline 组件 | `timeline-*` | 1 |
| 主题切换 | `data-theme` | 1 |
| 高亮色 | `bg-primary`（hr 上） | 1 |

没有使用 daisyUI 的 btn、card、modal 等组件类。

## 颜色映射方案

```
daisyUI           →  shadcn 替代
bg-base-100       →  bg-background (或 bg-card)
bg-base-200       →  bg-muted
bg-base-300       →  bg-accent
text-base-content →  text-foreground
bg-primary        →  bg-primary (shadcn 已有)
data-theme        →  删除，只用 class
```

## Timeline 组件

`src/renderer/src/components/modules/player/loading/Timeline.tsx` 是唯一使用 daisyUI 组件类的地方（timeline、timeline-middle、timeline-box、timeline-start、timeline-end）。需要用 flex + 自定义样式替代。

## 涉及文件（8 个）

- `src/renderer/src/components/layout/sidebar/index.tsx`
- `src/renderer/src/components/ui/tabs/Tabs.tsx`
- `src/renderer/src/components/ui/modal/stacked/Modal.tsx`
- `src/renderer/src/components/ui/button/FunctionAreaButton.tsx`
- `src/renderer/src/components/modules/settings/views/general/DarkMode.tsx`
- `src/renderer/src/components/modules/settings/index.tsx`
- `src/renderer/src/components/modules/app/WindowsTitlebar.tsx`
- `src/renderer/src/components/icons/Logo.tsx`
- `src/renderer/src/components/modules/player/loading/Timeline.tsx`（Timeline 重写）
- `src/renderer/src/providers/index.tsx`（移除 data-theme attribute）
- `src/renderer/src/styles/tailwind.css`（移除 daisyUI 插件配置）
