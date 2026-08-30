import type { ComponentPropsWithoutRef, PropsWithChildren, Ref } from 'react'
import { cn } from '@renderer/lib/utils'

export interface PlayerShellProps extends PropsWithChildren {
  className?: string
  title?: string
  rootRef?: Ref<HTMLElement>
}

export const PlayerShell = ({ className, title, rootRef, children }: PlayerShellProps) => (
  <section
    ref={rootRef}
    data-player-root
    data-player-active
    aria-label={title ? `正在播放：${title}` : '视频播放器'}
    className={cn(
      'fixed inset-0 isolate overflow-hidden bg-black text-white selection:bg-white/25',
      className,
    )}
  >
    {children}
  </section>
)

interface VideoSurfaceProps extends Omit<ComponentPropsWithoutRef<'video'>, 'ref'> {
  videoRef?: Ref<HTMLVideoElement>
  rotation?: 0 | 90 | 180 | 270
}

export const VideoSurface = ({
  videoRef,
  rotation = 0,
  className,
  style,
  ...props
}: VideoSurfaceProps) => (
  <video
    ref={videoRef}
    data-player-video
    data-rotation={rotation}
    className={cn('absolute top-1/2 left-1/2 z-0 bg-black object-contain', className)}
    style={{
      width: rotation === 90 || rotation === 270 ? '100dvh' : '100dvw',
      height: rotation === 90 || rotation === 270 ? '100dvw' : '100dvh',
      transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
      ...style,
    }}
    playsInline
    preload="metadata"
    aria-label="视频画面"
    {...props}
  />
)

interface SurfaceProps extends ComponentPropsWithoutRef<'div'> {
  surfaceRef?: Ref<HTMLDivElement>
}

export const SubtitleSurface = ({ surfaceRef, className, ...props }: SurfaceProps) => (
  <div
    ref={surfaceRef}
    data-player-subtitle-surface
    className={cn('pointer-events-none absolute inset-0 z-10 overflow-hidden', className)}
    aria-hidden="true"
    {...props}
  />
)

export const DanmakuSurface = ({ surfaceRef, className, ...props }: SurfaceProps) => (
  <div
    ref={surfaceRef}
    data-player-danmaku-surface
    className={cn('pointer-events-none absolute inset-0 z-20 overflow-hidden', className)}
    aria-hidden="true"
    {...props}
  />
)

export const InteractionSurface = ({ surfaceRef, className, ...props }: SurfaceProps) => (
  <div
    ref={surfaceRef}
    data-player-interaction-surface
    className={cn('absolute inset-0 z-30 outline-none', className)}
    {...props}
  />
)
