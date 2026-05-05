import { playerSettingSheetAtom } from '@renderer/atoms/player'
import { jotaiStore } from '@renderer/atoms/store'
import { cn, isWeb } from '@renderer/lib/utils'
import { usePlayerLoadingSelector } from '@renderer/services/player-loading/hooks'
import { getPlayerLoadingService } from '@renderer/services/player-loading/index'

const PlayList = () => {
  // 从 service state 读取匹配信息和视频信息
  const match = usePlayerLoadingSelector((s) => 'match' in s ? s.match : null)
  const video = usePlayerLoadingSelector((s) => 'video' in s ? s.video : null)

  return (
    <ul className="w-full space-y-3">
      {isWeb ? (
        <li
          className={cn(
            'text-secondary hover:text-primary flex items-center transition-colors duration-100',
          )}
        >
          {video?.name}
        </li>
      ) : (
        video?.playList?.map(({ name, urlWithPrefix }) => {
          const playingVideo = name === video.name
          const getTitle = () => {
            if (playingVideo && match?.animeTitle && match?.episodeTitle) {
              return `${match.animeTitle}-${match.episodeTitle}`
            }
            return name
          }
          return (
            <li
              key={name}
              className={cn(
                'hover:text-primary flex items-center transition-colors duration-100',
                playingVideo && 'text-primary',
              )}
              onClick={() => {
                if (playingVideo) {
                  return
                }
                jotaiStore.set(playerSettingSheetAtom, false)
                // 通过 service 加载下一集
                getPlayerLoadingService().loadFromPath(urlWithPrefix)
              }}
            >
              {getTitle()}
            </li>
          )
        })
      )}
    </ul>
  )
}

export default PlayList
