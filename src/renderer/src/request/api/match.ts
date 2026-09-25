import type { MatchResponseV2, MatchVideoRequestModel } from '../models/match'
import type { RequestControl } from '../ofetch'
import { Post } from '../ofetch'

export enum Matchkeys {
  postVideoEpisodeId = 'postVideoEpisodeId',
}

function postVideoEpisodeId(data: MatchVideoRequestModel, control?: RequestControl) {
  return Post<MatchResponseV2>('/match', data, control)
}

export const match = {
  postVideoEpisodeId,
  Matchkeys,
}
