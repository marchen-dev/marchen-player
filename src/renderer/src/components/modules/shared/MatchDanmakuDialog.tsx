/**
 * 播放中/历史记录页面的重新匹配弹幕对话框
 *
 * 通过 service.rematch() 触发播放中重新匹配。
 * 历史记录页面使用 useQuery 获取匹配数据。
 */

import type { MatchedVideo } from '@marchen/player-core'
import { db } from '@renderer/database/db'
import { ipcClient } from '@renderer/lib/client'
import { apiClient } from '@renderer/request'
import { RouteName, useCurrentRoute } from '@renderer/router'
import { getPlayerLoadingService } from '@renderer/services/player-loading/index'
import { useQuery } from '@tanstack/react-query'
import { useAtomValue } from 'jotai'

import { showMatchAnimeDialogAtom } from '../player/loading/dialog/hooks'
import { MatchAnimeDialog } from '../player/loading/dialog/MatchAnimeDialog'

export const MatchDanmakuDialog = () => {
  const { hash } = useAtomValue(showMatchAnimeDialogAtom)
  const routes = useCurrentRoute()

  // 仅在历史记录页面获取匹配数据（播放中由 service 管理）
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
    enabled: !!hash && routes?.path === RouteName.HISTORY,
  })

  const handleUpdateHistory = async (params?: MatchedVideo) => {
    if (!params || !hash) return

    // 通过 service 重新匹配（会自动获取弹幕、更新播放器、保存历史）
    getPlayerLoadingService().rematch(params)
  }

  return <MatchAnimeDialog matchData={matchData} onSelected={handleUpdateHistory} />
}
