import { cn } from '@renderer/lib/utils'
import { useNativeDanmaku } from './context'

export const NativeDanmakuSurface = ({ className }: { className?: string }) => {
  const { surfaceRef } = useNativeDanmaku()
  return (
    <div
      ref={surfaceRef}
      data-player-danmaku-surface
      data-telemetry-replay-block
      className={cn('pointer-events-none absolute inset-0 z-20 overflow-hidden', className)}
      aria-hidden="true"
    />
  )
}
