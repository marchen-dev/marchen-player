/**
 * DanmakuAPI adapter：调用 dandanplay API
 *
 * 实现 @marchen/player-loading 的 DanmakuAPI 接口，
 * 内部使用项目已有的 apiClient 发起请求。
 */

import type { CommentsData, DanmakuAPI, MatchResult } from '@marchen/player-loading'
import { videoAtom } from '@renderer/atoms/player'
import { jotaiStore } from '@renderer/atoms/store'
import { apiClient } from '@renderer/request'
import { getPlayerOperationId } from '@renderer/services/telemetry/player-loading-observer'

export class DandanplayAPI implements DanmakuAPI {
  async match(
    params: { hash: string; size: number; name: string },
    signal?: AbortSignal,
  ): Promise<MatchResult> {
    const result = await apiClient.match.postVideoEpisodeId(
      {
        fileHash: params.hash,
        fileSize: params.size,
        fileName: params.name,
      },
      { signal, silent: true, operationId: getPlayerOperationId(params.hash) },
    )
    if (result.success === false || result.errorCode)
      throw new Error(result.errorMessage || '匹配请求失败')
    return {
      isMatched: result.isMatched,
      matches: (result.matches ?? []).map((m) => ({
        episodeId: m.episodeId,
        animeTitle: m.animeTitle || '',
        episodeTitle: m.episodeTitle || '',
        animeId: m.animeId,
      })),
    }
  }

  async getDanmu(
    episodeId: number,
    opts: { withRelated: boolean; signal?: AbortSignal },
  ): Promise<CommentsData> {
    const data = await apiClient.comment.getDanmu(
      episodeId,
      { withRelated: opts.withRelated },
      {
        signal: opts.signal,
        silent: true,
        operationId: getPlayerOperationId(jotaiStore.get(videoAtom).hash),
      },
    )
    if (data.success === false || data.errorCode)
      throw new Error(data.errorMessage || '弹幕请求失败')
    return { count: data.count, comments: data.comments }
  }
}
