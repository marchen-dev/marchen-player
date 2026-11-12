import { playerSettingsPanelAtom } from '@renderer/atoms/player'
import { useWindowFullscreen, useWindowState, WindowState } from '@renderer/atoms/window'
import { ipcClient } from '@renderer/lib/client'
import { cn, isMac, isWeb, isWindows } from '@renderer/lib/utils'
import { reportOperationalError } from '@renderer/services/telemetry/operational-errors'
import { useAtomValue } from 'jotai'
import { useEffect } from 'react'

const setMacWindowButtonsVisible = (visible: boolean) => {
  if (isWeb || !isMac) return
  void ipcClient?.app
    .windowAction({ action: visible ? 'show-title-bar' : 'hidden-title-bar' })
    .catch((error) => reportOperationalError('player', 'window_buttons.visibility', error))
}

export const PlayerWindowChrome = ({
  onClose,
  visible = true,
  onHoverChange,
}: {
  onClose: () => void
  visible?: boolean
  onHoverChange?: (hovered: boolean) => void
}) => {
  const fullscreen = useWindowFullscreen()
  const windowState = useWindowState()
  const settingsPanelOpen = useAtomValue(playerSettingsPanelAtom).open

  // 全屏时必须保留系统红绿灯，由 macOS 在顶部悬停时展示退出入口；窗口模式才跟随控制栏。
  useEffect(() => {
    setMacWindowButtonsVisible(fullscreen || visible)
  }, [visible, fullscreen])

  // 退出播放或切换加载界面时恢复，避免普通页面留下隐藏的窗口按钮。
  useEffect(() => () => setMacWindowButtonsVisible(true), [])

  return (
    <header
      data-player-window-chrome
      inert={!visible}
      aria-hidden={!visible}
      onPointerEnter={() => onHoverChange?.(true)}
      onPointerLeave={() => onHoverChange?.(false)}
      style={{ right: settingsPanelOpen ? 'var(--player-settings-width)' : 0 }}
      className={cn(
        'pointer-events-none absolute top-0 left-0 z-40 h-20 transition-opacity duration-200 motion-reduce:transition-none',
        visible ? 'opacity-100' : 'opacity-0',
        !isWeb && !fullscreen && visible && 'drag-region',
        'px-4 text-white/70',
      )}
    >
      <button
        type="button"
        aria-label="关闭当前播放"
        className={cn(
          'no-drag-region bg-player-popover player-glass pointer-events-auto absolute flex h-8 cursor-default items-center gap-1 rounded-lg px-2 text-xs font-semibold text-white/85 transition-colors',
          'hover:text-white hover:brightness-125 focus-visible:ring-2 focus-visible:ring-[var(--player-focus)] focus-visible:outline-none',
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
      'no-drag-region pointer-events-auto flex h-9 w-12 items-center justify-center text-white/75 transition-colors hover:bg-white/10 hover:text-white',
      danger && 'hover:bg-red-500',
    )}
    onClick={onClick}
  >
    <i className={icon} aria-hidden />
  </button>
)
