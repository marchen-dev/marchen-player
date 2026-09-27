import type { FC } from 'react'
import { Badge } from '@renderer/components/ui/badge'
import { cn } from '@renderer/lib/utils'

/** 实验功能标记，用于实验室开关及其对应入口，保持两处视觉一致 */
export const BetaBadge: FC<{ className?: string }> = ({ className }) => (
  <Badge
    variant="outline"
    className={cn(
      'border-indigo-500/40 bg-indigo-500/10 px-1.5 py-0 text-[10px] leading-4 font-semibold tracking-wide text-indigo-600 uppercase dark:border-indigo-300/40 dark:bg-indigo-300/10 dark:text-indigo-300',
      className,
    )}
  >
    Beta
  </Badge>
)
