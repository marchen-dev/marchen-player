import { currentMatchedVideoAtom, playerSettingSheetAtom } from '@renderer/atoms/player'
import { jotaiStore } from '@renderer/atoms/store'
import { cn, isWeb } from '@renderer/lib/utils'
import { useAtomValue } from 'jotai'

import { useVideo } from '../../../loading/hooks'

const PlayList = () => {
  const { animeTitle, episodeTitle } = useAtomValue(currentMatchedVideoAtom)
  const { importAnimeViaIPC, video } = useVideo()
  return (
    <ul className="w-full space-y-3">
      {isWeb ? (
        <li
        className={cn(
          'flex items-center text-secondary transition-colors duration-100 hover:text-primary',
        )}
        >
          {video?.name}
        </li>
      ) : (
        video?.playList?.map(({ name, urlWithPrefix }) => {
          const playingVideo = name === video.name
          return (
            <li
              key={name}
              className={cn(
                'flex items-center transition-colors duration-100 hover:text-primary',
                playingVideo && 'text-primary',
              )}
              onClick={() => {
                if (playingVideo) {
                  return
                }
                jotaiStore.set(playerSettingSheetAtom, false)
                importAnimeViaIPC({ path: urlWithPrefix })
              }}
            >
              {playingVideo ? `${animeTitle}-${episodeTitle}` : name}
            </li>
          )
        })
      )}
    </ul>
  )
}

export default PlayList
