import { currentMatchedVideoAtom, isLoadDanmakuAtom, videoAtom } from '@renderer/atoms/player'
import { usePlayerSettingsValue } from '@renderer/atoms/settings/player'
import { useToast } from '@renderer/components/ui/toast'
import NextEpisode from '@renderer/components/ui/xgplayer/plugins/nextEpisode'
import PreviousEpisode from '@renderer/components/ui/xgplayer/plugins/previousEpisode'
import { db } from '@renderer/database/db'
import { parseDanmakuData } from '@renderer/lib/danmaku'
import { isWeb } from '@renderer/lib/utils'
import type { CommentModel } from '@renderer/request/models/comment'
import type { Danmu, IPlayerOptions } from '@suemor/xgplayer'
import XgPlayer from '@suemor/xgplayer'
import { useAtomValue } from 'jotai'
import { useCallback, useEffect, useRef, useState } from 'react'

import { useDanmakuData } from '../loading/hooks'
import { danmakuConfig, playerBaseConfigForClient, playerBaseConfigForWeb } from './config'

export interface PlayerType extends XgPlayer {
  danmu?: Danmu
}

let _playerInstance: PlayerType | null = null

export const useXgPlayer = (url: string) => {
  const [playerInstance, setPlayerInstance] = useState<PlayerType | null>(null)
  const playerRef = useRef<HTMLDivElement | null>(null)
  const { toast, dismiss } = useToast()
  const currentMatchedVideo = useAtomValue(currentMatchedVideoAtom)
  const isLoadDanmaku = useAtomValue(isLoadDanmakuAtom)
  const video = useAtomValue(videoAtom)
  const playerSettings = usePlayerSettingsValue()
  const { danmakuDuration, danmakuFontSize, danmakuEndArea, enableMiniProgress } = playerSettings
  const { setResponsiveSettingsUpdate } = useXgPlayerUtils()
  const { mergedDanmakuData } = useDanmakuData()
  useEffect(() => {
    setResponsiveSettingsUpdate(playerInstance)
    return () => {
      dismiss()
    }
  }, [setResponsiveSettingsUpdate])

  useEffect(() => {
    const handleInitalizePlayer = async () => {
      if (playerRef.current && !playerInstance) {
        const anime = await db.history.get(video.hash)
        const enablePositioningProgress = !!anime?.progress
        let startTime = 0
        if (enablePositioningProgress) {
          const playbackCompleted = anime?.progress === anime?.duration
          if (playbackCompleted) {
            startTime = 0
          } else {
            startTime = anime?.progress || 0
          }
        }
        const xgplayerConfig = {
          ...(isWeb ? playerBaseConfigForWeb : playerBaseConfigForClient),
          miniprogress: enableMiniProgress,
          el: playerRef.current,
          url,
          startTime,
        } as IPlayerOptions

        let manualDanmaku: CommentModel[] = []

        if (!isLoadDanmaku) {
          manualDanmaku =
            anime?.danmaku
              ?.filter((item) => item.type === 'local' || item.type === 'third-party-manual')
              .filter((danmaku) => danmaku.selected)
              .map((danmaku) => danmaku?.content)
              .flatMap((danmaku) => danmaku.comments) ?? []
        }
        xgplayerConfig.danmu = {
          ...danmakuConfig,
          comments: parseDanmakuData({
            danmuData: [...(mergedDanmakuData || []), ...manualDanmaku],
            duration: +danmakuDuration,
          }),
          fontSize: +danmakuFontSize,
          area: {
            start: 0,
            end: +danmakuEndArea,
          },
        }

        if (!isWeb) {
          xgplayerConfig.plugins = [...(xgplayerConfig.plugins || []), NextEpisode, PreviousEpisode]
          xgplayerConfig.nextEpisode = {
            urlList: video.playList?.map((item) => item.urlWithPrefix) ?? [],
          }

          xgplayerConfig.previousEpisode = {
            urlList: video.playList?.map((item) => item.urlWithPrefix) ?? [],
          }
        }
        _playerInstance = new XgPlayer(xgplayerConfig)
        setPlayerInstance(_playerInstance)
        if (isLoadDanmaku) {
          toast({
            title: `${currentMatchedVideo.animeTitle} - ${currentMatchedVideo.episodeTitle}`,
            description: (
              <div>
                <p>共加载 {mergedDanmakuData?.length} 条弹幕</p>
              </div>
            ),
            duration: 5000,
          })
        }
      }
    }
    handleInitalizePlayer()
    return () => {
      _playerInstance?.destroy()
      playerInstance?.destroy()
      setPlayerInstance(null)
    }
  }, [playerRef])

  return { playerRef, playerInstance }
}

export const useXgPlayerUtils = () => {
  const playerSettings = usePlayerSettingsValue()

  const setResponsiveSettingsUpdate = useCallback(
    (playerInstance: PlayerType | null) => {
      if (playerInstance?.isPlaying) {
        const { danmakuDuration, danmakuEndArea, danmakuFontSize } = playerSettings
        playerInstance.danmu?.setFontSize(+danmakuFontSize, 24)
        playerInstance.danmu?.setAllDuration('all', +danmakuDuration)
        playerInstance.danmu?.setArea({
          start: 0,
          end: +danmakuEndArea,
        })
      }
    },
    [playerSettings],
  )

  return {
    setResponsiveSettingsUpdate,
  }
}
