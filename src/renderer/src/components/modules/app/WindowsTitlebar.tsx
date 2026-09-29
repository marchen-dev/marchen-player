import { useWindowState, WindowState } from '@renderer/atoms/window'
import { ipcClient } from '@renderer/lib/client'

export const Titlebar = () => {
  const windowState = useWindowState()

  return (
    <div className="no-drag-region -mr-4 flex h-full shrink-0 items-center">
      <button
        className="no-drag-region hover:bg-muted pointer-events-auto flex h-full w-[50px] items-center justify-center duration-200"
        type="button"
        aria-label="最小化"
        onClick={() => {
          ipcClient?.app.windowAction({ action: 'minimize' })
        }}
      >
        <i className="icon-[mingcute--minimize-line]" />
      </button>

      <button
        type="button"
        aria-label={windowState === WindowState.MAXIMIZED ? '还原窗口' : '最大化'}
        className="no-drag-region hover:bg-muted pointer-events-auto flex h-full w-[50px] items-center justify-center duration-200"
        onClick={async () => {
          await ipcClient?.app.windowAction({ action: 'maximum' })
        }}
      >
        {windowState === WindowState.MAXIMIZED ? (
          <i className="icon-[mingcute--restore-line]" />
        ) : (
          <i className="icon-[mingcute--square-line]" />
        )}
      </button>

      <button
        type="button"
        aria-label="关闭窗口"
        className="no-drag-region pointer-events-auto flex h-full w-[50px] items-center justify-center duration-200 hover:bg-red-500 hover:!text-white"
        onClick={() => {
          ipcClient?.app.windowAction({ action: 'close' })
        }}
      >
        <i className="icon-[mingcute--close-line]" />
      </button>
    </div>
  )
}
