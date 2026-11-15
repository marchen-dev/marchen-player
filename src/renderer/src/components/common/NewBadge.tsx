import type { NewFeatureId } from '@renderer/lib/new-features'
import type { FC } from 'react'
import { useAppSettingsValue } from '@renderer/atoms/settings/app'
import { Badge } from '@renderer/components/ui/badge'
import { shouldShowNewBadge } from '@renderer/lib/new-features'
import { cn } from '@renderer/lib/utils'

const APP_VERSION = typeof __MARCHEN_VERSION__ === 'undefined' ? '0.0.0' : __MARCHEN_VERSION__

interface NewBadgeProps {
  /** 在 lib/new-features.ts 的 NEW_FEATURES 中登记的功能 ID */
  feature: NewFeatureId
  /** 位于播放器的深色毛玻璃界面上：不随主题变化，改用播放器强调色保证对比度 */
  playerMaterial?: boolean
  className?: string
}

/**
 * 新功能标记，放在功能标题旁。是否显示由登记表与「用过 / 到期」规则决定，
 * 不需要显示时不渲染任何内容，调用方可以无条件放置。
 * 视觉与 BetaBadge 保持一致。
 */
export const NewBadge: FC<NewBadgeProps> = ({ feature, playerMaterial, className }) => {
  const { seenNewFeatures } = useAppSettingsValue()
  if (!shouldShowNewBadge(feature, APP_VERSION, seenNewFeatures)) return null
  return (
    <Badge
      variant="outline"
      className={cn(
        'px-1.5 py-0 text-[10px] leading-4 font-semibold tracking-wide uppercase',
        playerMaterial
          ? 'border-transparent bg-[var(--player-settings-accent)] text-white'
          : 'border-brand/40 bg-brand/10 text-brand-text',
        className,
      )}
    >
      New
    </Badge>
  )
}
