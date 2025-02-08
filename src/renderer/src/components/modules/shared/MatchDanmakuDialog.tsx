import type { MatchedVideoType } from '@renderer/atoms/player'
import { currentMatchedVideoAtom } from '@renderer/atoms/player'
import { db } from '@renderer/database/db'
import { tipcClient } from '@renderer/lib/client'
import { apiClient } from '@renderer/request'
import { RouteName, useCurrentRoute } from '@renderer/router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAtomValue, useSetAtom } from 'jotai'

import { showMatchAnimeDialogAtom } from '../player/loading/dialog/hooks'
import { MatchAnimeDialog } from '../player/loading/dialog/MatchAnimeDialog'
import { saveToHistory } from '../player/loading/hooks'

export const MatchDanmakuDialog = () => {
  const { hash } = useAtomValue(showMatchAnimeDialogAtom)
  const setCurrentMatchedVideoAtom = useSetAtom(currentMatchedVideoAtom)
  const queryClient = useQueryClient()
  const routes = useCurrentRoute()
  const { data: matchData } = useQuery({
    queryKey: [apiClient.match.Matchkeys.postVideoEpisodeId, hash],
    queryFn: async () => {
      const historyData = await db.history.get({ hash })
      if (!historyData?.path) {
        return
      }
      const animeDetail = await tipcClient?.getAnimeDetailByPath({ path: historyData.path })
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
    await saveToHistory({
      path,
      subtitles,
      hash,
      ...params,
    })

    // 如果之前之前播放过动漫，就更新匹配数据
    queryClient.setQueryData([apiClient.match.Matchkeys.postVideoEpisodeId, hash], {
      isMatched: true,
      matches: [{ episodeTitle, episodeId, animeId, animeTitle }],
    })

    setCurrentMatchedVideoAtom(params)
  }
  return <MatchAnimeDialog matchData={matchData} onSelected={handleUpdateHistory} />
}
