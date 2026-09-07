import { cn } from '@renderer/lib/utils'
import { useNativeDanmaku } from './context'

export const NativeDanmakuSurface = ({ className }: { className?: string }) => {
  const { surfaceRef } = useNativeDanmaku()
  // 弹幕需位于透明操作层（30）之上才能接收悬停；控制器仍位于更高的 40 层。
  return (
    <div
      ref={surfaceRef}
      data-player-danmaku-surface
      data-telemetry-replay-block
      className={cn('pointer-events-none absolute inset-0 z-[35] overflow-hidden', className)}
    />
  )
}
