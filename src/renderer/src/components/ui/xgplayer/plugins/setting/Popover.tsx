/* eslint-disable tailwindcss/no-custom-classname */
import { cn } from '@renderer/lib/utils'
// import './index.css'
import { renderToString } from 'react-dom/server'

const SubtitlePopover = () => {
  return (
    <div>
      <div className={cn('relative !mr-5 !mt-1 text-white ', 'xgplayer-plugin-setting-container')}>
        <div className={cn('cursor-pointer ')}>
          <input type="file" accept=".ass,.ssa" className="xgplayer-plugin-subtitle-input hidden" />
          <i
            className={cn(
              'icon-[mingcute--text-color-line]',
              'h-[32px] w-[27px]',
              'xgplayer-plugin-setting-icon',
            )}
          />
        </div>

        <div
          className={cn(
            'absolute -left-28 bottom-14 hidden h-80 w-72 rounded-2xl bg-zinc-900 opacity-95  shadow-sm',
            'xgplayer-plugin-subtitle-popover-content',
          )}
        >
          <div className="text-black">
            <p>111111</p>
          </div>
        </div>
      </div>
    </div>
  )
}
export const subtitlePopoverToString = renderToString(<SubtitlePopover />)
