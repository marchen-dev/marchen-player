import { useWindowFullscreen, useWindowState, WindowState } from '@renderer/atoms/window'
import { ipcClient } from '@renderer/lib/client'
import { cn, isMac, isWeb, isWindows } from '@renderer/lib/utils'

export const PlayerWindowChrome = ({ onClose }: { onClose: () => void }) => {
  const fullscreen = useWindowFullscreen()
  const windowState = useWindowState()

  return (
    <header
      data-player-window-chrome
      className={cn(
        'drag-region pointer-events-none absolute inset-x-0 top-0 z-40 h-20',
        'bg-gradient-to-b from-black/60 via-black/20 to-transparent px-4 text-white/70',
      )}
    >
      <button
        type="button"
        aria-label="关闭当前播放"
        className={cn(
          'no-drag-region pointer-events-auto absolute flex h-8 cursor-default items-center gap-1 rounded-lg bg-black/35 px-2 text-xs font-semibold text-white/85 backdrop-blur-xl transition-colors',
          'hover:bg-black/50 hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--player-focus)] focus-visible:outline-none',
          isMac && !fullscreen ? 'top-9 left-2' : 'top-4 left-4',
        )}
        onClick={onClose}
      >
        <i className="icon-[mingcute--close-line] text-base" aria-hidden />
        <span>关闭</span>
      </button>

      {!isWeb && !fullscreen && isWindows && (
        <div className="no-drag-region pointer-events-auto absolute top-0 right-0 flex h-12 items-start">
          <WindowButton
            label="最小化"
            icon="icon-[mingcute--minimize-line]"
            onClick={() => ipcClient?.app.windowAction({ action: 'minimize' })}
          />
          <WindowButton
            label={windowState === WindowState.MAXIMIZED ? '还原窗口' : '最大化'}
            icon={
              windowState === WindowState.MAXIMIZED
                ? 'icon-[mingcute--restore-line]'
                : 'icon-[mingcute--square-line]'
            }
            onClick={() => ipcClient?.app.windowAction({ action: 'maximum' })}
          />
          <WindowButton
            label="关闭"
            icon="icon-[mingcute--close-line]"
            danger
            onClick={() => ipcClient?.app.windowAction({ action: 'close' })}
          />
        </div>
      )}
    </header>
  )
}

const WindowButton = ({
  label,
  icon,
  danger,
  onClick,
}: {
  label: string
  icon: string
  danger?: boolean
  onClick: () => void
}) => (
  <button
    type="button"
    aria-label={label}
    className={cn(
      'flex h-9 w-12 items-center justify-center text-white/75 transition-colors hover:bg-white/10 hover:text-white',
      danger && 'hover:bg-red-500',
    )}
    onClick={onClick}
  >
    <i className={icon} aria-hidden />
  </button>
)
