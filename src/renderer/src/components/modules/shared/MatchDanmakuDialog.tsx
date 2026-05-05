import type { MatchedVideoType } from '@renderer/atoms/player'
import { currentMatchedVideoAtom, danmakuDataAtom } from '@renderer/atoms/player'
import { jotaiStore } from '@renderer/atoms/store'
import { db } from '@renderer/database/db'
import { ipcClient } from '@renderer/lib/client'
import { mergeDanmaku } from '@renderer/lib/danmaku'
import queryClient from '@renderer/lib/query-client'
import { apiClient } from '@renderer/request'
import { RouteName, useCurrentRoute } from '@renderer/router'
import { useQuery } from '@tanstack/react-query'
import { useAtomValue, useSetAtom } from 'jotai'

import { showMatchAnimeDialogAtom } from '../player/loading/dialog/hooks'
import { MatchAnimeDialog } from '../player/loading/dialog/MatchAnimeDialog'
import { fetchDanmakuForEpisode, saveToHistory } from '../player/loading/hooks'
import { SettingProviderQueryKey } from '../player/setting/Sheet'

export const MatchDanmakuDialog = () => {
  const { hash } = useAtomValue(showMatchAnimeDialogAtom)
  const setCurrentMatchedVideoAtom = useSetAtom(currentMatchedVideoAtom)
  const routes = useCurrentRoute()
  const { data: matchData } = useQuery({
    queryKey: [apiClient.match.Matchkeys.postVideoEpisodeId, hash],
    queryFn: async () => {
      const historyData = await db.history.get({ hash })
      if (!historyData?.path) {
        return
      }
      const animeDetail = await ipcClient?.player.getAnimeDetailByPath({ path: historyData.path })
      if (!animeDetail || animeDetail.ok !== 1) {
        return
      }
      const { fileHash, fileSize, fileName } = animeDetail
      if (!fileHash || !fileSize || !fileName) {
        return
      }

      return apiClient.match.postVideoEpisodeId({ fileSize, fileHash, fileName })
    },
    // 仅在历史记录页面才需要重新获取匹配数据
    enabled: !!hash && routes?.path === RouteName.HISTORY,
  })

  const handleUpdateHistory = async (params?: MatchedVideoType) => {
    const old = await db.history.get({ hash })
    if (!old || !hash) {
      return
    }

    const { path, subtitles } = old
    if (!params) {
      return
    }
    const { episodeId, episodeTitle, animeId, animeTitle } = params

    // 获取新弹幕并更新播放器（强制刷新，因为 episodeId 变了）
    const danmakuData = await fetchDanmakuForEpisode(episodeId, hash, true)
    const mergedComments = mergeDanmaku(danmakuData)
    jotaiStore.set(danmakuDataAtom, mergedComments ?? null)

    await saveToHistory({
      path,
      subtitles,
      hash,
      ...params,
      danmaku: danmakuData,
    })

    // 更新设置面板的弹幕数据缓存
    queryClient.setQueryData([SettingProviderQueryKey, hash], (oldData: any) => ({
      ...oldData,
      danmaku: danmakuData,
      episodeId,
      episodeTitle,
      animeId,
      animeTitle,
    }))

    setCurrentMatchedVideoAtom(params)
  }
  return <MatchAnimeDialog matchData={matchData} onSelected={handleUpdateHistory} />
}
