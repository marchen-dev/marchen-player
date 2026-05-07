/**
 * 播放器初始化 hooks
 *
 * useXgPlayer：创建 xgplayer 实例，从 service state 读取弹幕数据
 * useXgPlayerUtils：响应式设置更新
 */

import type { Danmu, IPlayerOptions } from '@suemor/xgplayer'
import { usePlayerSettingsValue } from '@renderer/atoms/settings/player'
import { useToast } from '@renderer/components/ui/toast'
import NextEpisode from '@renderer/components/ui/xgplayer/plugins/nextEpisode'
import PreviousEpisode from '@renderer/components/ui/xgplayer/plugins/previousEpisode'
import { db } from '@renderer/database/db'
import { parseDanmakuData } from '@renderer/lib/danmaku'
import { isWeb } from '@renderer/lib/utils'
import { usePlayerLoadingService } from '@renderer/services/player-loading/hooks'
import { getPlayerLoadingService } from '@renderer/services/player-loading/index'
import XgPlayer from '@suemor/xgplayer'
import { useCallback, useEffect, useRef, useState } from 'react'

import { danmakuConfig, playerBaseConfigForClient, playerBaseConfigForWeb } from './config'

export interface PlayerType extends XgPlayer {
  danmu?: Danmu
}

let _playerInstance: PlayerType | null = null

export const useXgPlayer = (url: string) => {
  const [playerInstance, setPlayerInstance] = useState<PlayerType | null>(null)
  const playerRef = useRef<HTMLDivElement | null>(null)
  const { toast, dismiss } = useToast()
  const service = usePlayerLoadingService()
  const playerSettings = usePlayerSettingsValue()
  const { danmakuDuration, danmakuFontSize, danmakuEndArea, enableMiniProgress } = playerSettings
  const { setResponsiveSettingsUpdate } = useXgPlayerUtils()

  useEffect(() => {
    setResponsiveSettingsUpdate(playerInstance)
    return () => {
      dismiss()
    }
  }, [setResponsiveSettingsUpdate])

  useEffect(() => {
    const handleInitalizePlayer = async () => {
      if (playerRef.current && !playerInstance) {
        // 从 service state 读取当前状态
        const state = service.currentState
        const video = 'video' in state ? state.video : null
        if (!video || !('hash' in video) || !video.hash) return

        const anime = await db.history.get(video.hash as string)
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

        // 从 service state 读取弹幕数据
        const mergedComments = 'mergedComments' in state ? state.mergedComments : []
        const playList = video.playList ?? []
        const match = 'match' in state ? state.match : null

        xgplayerConfig.danmu = {
          ...danmakuConfig,
          comments: parseDanmakuData({
            danmuData: mergedComments,
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
            urlList: playList.map((item) => item.urlWithPrefix),
          }
          xgplayerConfig.previousEpisode = {
            urlList: playList.map((item) => item.urlWithPrefix),
          }
        }

        _playerInstance = new XgPlayer(xgplayerConfig)
        setPlayerInstance(_playerInstance)

        // 连接 PlayerBridge，支持播放中热更新弹幕
        service.connectPlayer({
          updateDanmaku: (comments) => {
            const parsed = parseDanmakuData({
              danmuData: comments,
              duration: +danmakuDuration,
            })
            _playerInstance?.danmu?.clear()
            _playerInstance?.danmu?.updateComments(parsed, true)
            _playerInstance?.danmu?.setFontSize(+danmakuFontSize, 24)
            _playerInstance?.danmu?.setAllDuration('all', +danmakuDuration)
            _playerInstance?.danmu?.setArea({ start: 0, end: +danmakuEndArea })
          },
        })

        // 显示加载完成提示
        if (match && match.episodeId) {
          toast({
            title: `${match.animeTitle} - ${match.episodeTitle}`,
            description: (
              <div>
                <p>共加载 {mergedComments?.length ?? 0} 条弹幕</p>
              </div>
            ),
            duration: 5000,
          })
        }
      }
    }
    handleInitalizePlayer()
    return () => {
      // 断开 PlayerBridge
      getPlayerLoadingService().disconnectPlayer()
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
