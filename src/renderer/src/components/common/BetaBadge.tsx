import type { FC } from 'react'
import { Badge } from '@renderer/components/ui/badge'
import { cn } from '@renderer/lib/utils'

/** 实验功能标记，用于实验室开关及其对应入口，保持两处视觉一致 */
export const BetaBadge: FC<{ className?: string }> = ({ className }) => (
  <Badge
    variant="outline"
    className={cn(
      // 使用全局品牌色，与影视库强调色保持一致；亮色下文字取深一档保证小字号对比度
      'border-brand/40 bg-brand/10 text-brand-text px-1.5 py-0 text-[10px] leading-4 font-semibold tracking-wide uppercase',
      className,
    )}
  >
    Beta
  </Badge>
)
