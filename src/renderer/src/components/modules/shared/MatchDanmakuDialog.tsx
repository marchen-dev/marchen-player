/**
 * 播放中/影视库页面的重新匹配弹幕对话框
 *
 * 播放中：通过 service.rematch() 触发重新匹配（热更新弹幕）。
 * 影视库页面：直接更新 history 记录和 library 关联。
 */

import type { MatchedVideo } from '@marchen/player-core'
import { db } from '@renderer/database/db'
import { handleRematchLibraryUpdate } from '@renderer/database/lib/library-writer'
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
  const isLibraryPage = routes?.path === RouteName.LIBRARY

  // 仅在影视库页面获取匹配数据（播放中由 service 管理）
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
    enabled: !!hash && isLibraryPage,
  })

  const handleUpdateHistory = async (params?: MatchedVideo) => {
    if (!params || !hash) return

    // 读取旧的 animeId，用于更新 library 关联
    const oldHistory = await db.history.get(hash)
    const oldAnimeId = oldHistory?.animeId

    if (isLibraryPage) {
      // 影视库页面：直接更新 history 记录（播放器未运行）
      await db.history.update(hash, {
        animeId: params.animeId,
        episodeId: params.episodeId,
        animeTitle: params.animeTitle,
        episodeTitle: params.episodeTitle,
        danmaku: undefined, // 清除弹幕缓存，下次播放时重新获取
      })
    } else {
      // 播放中：通过 service 重新匹配（热更新弹幕）
      getPlayerLoadingService().rematch(params)
    }

    // 更新 library 表的关联关系
    handleRematchLibraryUpdate(oldAnimeId, params.animeId, params.episodeId, hash)
  }

  return <MatchAnimeDialog matchData={matchData} onSelected={handleUpdateHistory} />
}
