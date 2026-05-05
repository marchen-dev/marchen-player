/**
 * DanmakuAPI adapter：调用 dandanplay API
 *
 * 实现 @marchen/player-core 的 DanmakuAPI 接口，
 * 内部使用项目已有的 apiClient 发起请求。
 */

import type { CommentsData, DanmakuAPI, MatchResult } from '@marchen/player-core'
import { apiClient } from '@renderer/request'

export class DandanplayAPI implements DanmakuAPI {
  async match(params: { hash: string; size: number; name: string }): Promise<MatchResult> {
    const result = await apiClient.match.postVideoEpisodeId({
      fileHash: params.hash,
      fileSize: params.size,
      fileName: params.name,
    })
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
    opts: { withRelated: boolean; chConvert: number },
  ): Promise<CommentsData> {
    const data = await apiClient.comment.getDanmu(episodeId, {
      withRelated: opts.withRelated,
      chConvert: opts.chConvert,
    })
    return { count: data.count, comments: data.comments }
  }
}
