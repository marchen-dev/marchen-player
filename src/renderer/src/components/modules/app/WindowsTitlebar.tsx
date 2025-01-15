import { isPlayingAtom } from '@renderer/atoms/player'
import { ElECTRON_CUSTOM_TITLEBAR_HEIGHT, ELECTRON_WINDOWS_RADIUS } from '@renderer/constants'
import { tipcClient } from '@renderer/lib/client'
import { useQuery } from '@tanstack/react-query'
import { useAtomValue } from 'jotai'

export const Titlebar = () => {
  const { data: isMaximized, refetch } = useQuery({
    queryFn: () => tipcClient?.getWindowIsMaximized(),
    queryKey: ['windowIsMaximized'],
  })

  const isPlaying = useAtomValue(isPlayingAtom)

  // Hide titlebar when playing
  if (isPlaying) {
    return null
  }

  return (
    <div
      className="drag-region flex w-full items-center justify-end overflow-hidden"
      style={{
        height: `${ElECTRON_CUSTOM_TITLEBAR_HEIGHT}px`,
        borderTopLeftRadius: `${ELECTRON_WINDOWS_RADIUS}px`,
        borderTopRightRadius: `${ELECTRON_WINDOWS_RADIUS}px`,
      }}
    >
      <button
        className="no-drag-region pointer-events-auto flex h-full w-[50px] items-center justify-center duration-200 hover:bg-base-200"
        type="button"
        onClick={() => {
          tipcClient?.windowAction({ action: 'minimize' })
        }}
      >
        <i className="icon-[mingcute--minimize-line]" />
      </button>

      <button
        type="button"
        className="no-drag-region pointer-events-auto flex h-full w-[50px] items-center justify-center duration-200 hover:bg-base-200"
        onClick={async () => {
          await tipcClient?.windowAction({ action: 'maximum' })
          refetch()
        }}
      >
        {isMaximized ? (
          <i className="icon-[mingcute--restore-line]" />
        ) : (
          <i className="icon-[mingcute--square-line]" />
        )}
      </button>

      <button
        type="button"
        className="no-drag-region pointer-events-auto flex h-full w-[50px] items-center justify-center duration-200 hover:bg-red-500 hover:!text-white"
        onClick={() => {
          tipcClient?.windowAction({ action: 'close' })
        }}
      >
        <i className="icon-[mingcute--close-line]" />
      </button>
    </div>
  )
}
