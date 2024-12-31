import {
  currentMatchedVideoAtom,
  loadingDanmuProgressAtom,
  LoadingStatus,
  videoAtom,
} from '@renderer/atoms/player'
import { MatchAnimeDialog } from '@renderer/components/modules/player/loading/dialog/MatchAnimeDialog'
import { LoadingDanmuTimeLine } from '@renderer/components/modules/player/loading/Timeline'
import { useAtom, useAtomValue } from 'jotai'
import type { FC, PropsWithChildren } from 'react'
import { useEffect } from 'react'

import {
  saveToHistory,
  useDanmakuData,
  useLoadingHistoricalAnime,
  useMatchAnimeData,
} from './hooks'

export const VideoProvider: FC<PropsWithChildren> = ({ children }) => {
  useLoadingHistoricalAnime()
  const { clearPlayingVideo, matchData } = useMatchAnimeData()
  const { url, hash, name } = useAtomValue(videoAtom)
  const { danmakuData } = useDanmakuData()
  const [currentMatchedVideo, setCurrentMatchedVideo] = useAtom(currentMatchedVideoAtom)
  const [loadingProgress, setLoadingProgress] = useAtom(loadingDanmuProgressAtom)

  // 当上方 useQuery 获取弹幕成功后，会触发下方 useEffect, 保存到历史记录并开始播放
  useEffect(() => {
    if (danmakuData && currentMatchedVideo && hash) {
      saveToHistory({
        ...currentMatchedVideo,
        hash,
        danmaku: danmakuData,
        path: url,
      })
      setLoadingProgress(LoadingStatus.READY_PLAY)
      const timeoutId = setTimeout(() => {
        setLoadingProgress(LoadingStatus.START_PLAY)
      }, 100)
      return () => clearTimeout(timeoutId)
    }
    return () => {}
  }, [danmakuData, currentMatchedVideo])

  if (loadingProgress !== null && loadingProgress < LoadingStatus.START_PLAY) {
    return (
      <>
        {/* 加载进度条 */}
        <LoadingDanmuTimeLine />
        {/* 如果在 useMatchAnimeData() 里面没有匹配弹幕库成功， 就会弹出下方对话框，让用户手动匹配*/}
        <MatchAnimeDialog
          matchData={currentMatchedVideo.episodeId ? undefined : matchData}
          onSelected={async (params) => {
            const { type } = params
            switch (type) {
              case 'XML':
              case 'NONE':
              case 'URL': {
                await saveToHistory({
                  hash,
                  path: url,
                  animeTitle: name,
                  danmaku: params?.danmaku,
                })
                setCurrentMatchedVideo({
                  ...currentMatchedVideo,
                  episodeId: -1,
                })
                break
              }
              case 'LIST': {
                setCurrentMatchedVideo({
                  episodeId: params.episodeId,
                  animeTitle: params.animeTitle,
                  episodeTitle: params.episodeTitle,
                  animeId: params.animeId,
                })
                break
              }
            }
            // 如果用户选择不加载弹幕
              // 保存到历史记录

              // 如果用户选择不加载弹幕, 就直接开始播放
            // 如果用户手动选择了弹幕库，就使用用户选择的弹幕库，之后就会触发 useDanmuData() 里的 useQuery 和 useEffect

            // 因为用户手动选择了弹幕库，所以需要更新 queryClient 的数据, 确保下次加载的时候不会再次弹出对话框
            // queryClient.setQueryData([apiClient.match.Matchkeys.postVideoEpisodeId, hash], {
            //   isMatched: true,
            //   matches: [{ ...params }],
            // })
          }}
          onClosed={clearPlayingVideo}
          isLoading
        />
      </>
    )
  }
  return children
}
