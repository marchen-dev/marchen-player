import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '@renderer/lib/utils'

interface EntryRowProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ref?: Ref<HTMLButtonElement>
  label: ReactNode
  /** 右侧摘要；过长时截断，悬停用 summaryTitle 查看全文 */
  summary?: ReactNode
  summaryTitle?: string
}

/**
 * 卡片中进入弹窗或浮层的一行：名称、摘要、箭头，整行可点击。
 * 可作为 Popover / Dialog 的 `asChild` 触发器，所以要把 ref 与其余属性透传给 button。
 */
export const EntryRow = ({
  ref,
  label,
  summary,
  summaryTitle,
  className,
  ...props
}: EntryRowProps) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      // 负外边距让悬停底色铺满卡片宽度，内容仍与卡片其他行对齐
      '-mx-4 flex min-h-12 w-[calc(100%+2rem)] items-center gap-3 px-4 text-left text-sm transition-colors',
      'hover:bg-white/6 focus-visible:bg-white/6 focus-visible:outline-none',
      'focus-visible:ring-2 focus-visible:ring-[var(--player-settings-focus)] focus-visible:ring-inset',
      'disabled:pointer-events-none disabled:opacity-50',
      className,
    )}
    {...props}
  >
    <span className="shrink-0">{label}</span>
    <span
      className="ml-auto min-w-0 truncate text-[var(--player-settings-muted)]"
      title={summaryTitle}
    >
      {summary}
    </span>
    <i
      className="icon-[mingcute--right-line] shrink-0 text-base text-[var(--player-settings-muted)]"
      aria-hidden
    />
  </button>
)
