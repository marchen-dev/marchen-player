import { cn } from '@renderer/lib/utils'
import appIcon from '../../../../../resources/icon.png'

/** 与桌面运行时共用图标资源，避免内嵌图形在品牌更新时遗漏。 */
export const Logo = ({ className }: { className?: string }) => (
  <img
    src={appIcon}
    alt="Marchen 应用图标"
    className={cn('size-full object-contain', className)}
    draggable={false}
  />
)
