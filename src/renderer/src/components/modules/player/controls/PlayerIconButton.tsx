import type { ButtonHTMLAttributes } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/Tooltip'
import { cn } from '@renderer/lib/utils'
import { usePlayerPortalContainer } from '@renderer/services/player-runtime'

export interface PlayerIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  icon: string
  active?: boolean
  compact?: boolean
}

export const PlayerIconButton = ({
  label,
  icon,
  active,
  compact,
  className,
  ...props
}: PlayerIconButtonProps) => {
  const portalContainer = usePlayerPortalContainer()

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={active}
          className={cn(
            'no-drag-region inline-flex shrink-0 items-center justify-center rounded-lg text-[var(--player-fg-muted)]',
            'transition-colors hover:bg-white/10 hover:text-[var(--player-fg)]',
            'focus-visible:ring-2 focus-visible:ring-[var(--player-focus)] focus-visible:outline-none',
            'disabled:pointer-events-none disabled:opacity-35',
            compact ? 'size-9' : 'size-11',
            active && 'bg-white/12 text-[var(--player-fg)]',
            className,
          )}
          {...props}
        >
          <i className={cn(icon, compact ? 'text-lg' : 'text-xl')} aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent container={portalContainer} side="top" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
