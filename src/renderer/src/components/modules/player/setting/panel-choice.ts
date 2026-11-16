import { cn } from '@renderer/lib/utils'

/** 侧栏选项按钮的外观，单独的按钮（PanelChoice）与分段按钮共用 */
export const panelChoiceClassName = (active: boolean | undefined, className?: string) =>
  cn(
    // 按钮文字不折行：宽度不够时由所在网格调整列宽，而不是把文字竖着排
    'flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-white/11 px-3 text-sm whitespace-nowrap transition-colors',
    'focus-visible:ring-2 focus-visible:ring-[var(--player-settings-focus)] focus-visible:outline-none',
    active
      ? 'bg-white/14 text-[var(--player-settings-fg)]'
      : 'bg-white/6 text-[var(--player-settings-muted)] hover:bg-white/10 hover:text-[var(--player-settings-fg)]',
    className,
  )
