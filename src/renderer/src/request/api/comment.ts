import type { CommentsModel } from '../models/comment'
import { Get } from '../ofetch'

export enum Commentkeys {
  getDanmu = 'getDanmu',
  getExtcomment = 'getExtcomment',
}

function getDanmu(episodeId: number, params?: { chConvert: number }) {
  return Get<CommentsModel>(`/comment/${episodeId}`, {
    withRelated: false,
    ...params,
  })
}

function getExtcomment(params?: { url: string }) {
  return Get<CommentsModel>(`/extcomment`, {
    ...params,
  })
}


export const comment = {
  getDanmu,
  getExtcomment,
  Commentkeys,
}
