import type { ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'
import { useLayoutEffect, useRef } from 'react'

export const MobileControllerDock = ({
  transport,
  timeline,
  actions,
  visible = true,
  onRectChange,
}: {
  transport: ReactNode
  timeline: ReactNode
  actions: ReactNode
  visible?: boolean
  onRectChange?: (rect: DOMRect | null) => void
}) => {
  const dockRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    const report = () => {
      const rect = dockRef.current?.getBoundingClientRect()
      onRectChange?.(visible && rect && rect.width > 0 && rect.height > 0 ? rect : null)
    }
    report()
    const observer = new ResizeObserver(report)
    if (dockRef.current) observer.observe(dockRef.current)
    return () => observer.disconnect()
  }, [onRectChange, visible])

  return (
    <div
      ref={dockRef}
      data-player-mobile-dock
      role="group"
      aria-label="移动端播放控制"
      className={cn(
        'absolute inset-x-0 bottom-0 z-40 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-3 pt-16 transition-opacity duration-200 motion-reduce:transition-none sm:hidden',
        visible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
      )}
      style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
    >
      <div className="mb-3 flex items-center justify-center gap-5">{transport}</div>
      <div className="rounded-2xl border border-white/10 bg-[var(--player-surface)] px-3 py-2 shadow-[var(--player-shadow)] backdrop-blur-xl">
        <div className="flex h-8 items-center gap-2">{timeline}</div>
        <div className="mt-1 flex min-h-11 items-center justify-between gap-1">{actions}</div>
      </div>
    </div>
  )
}
