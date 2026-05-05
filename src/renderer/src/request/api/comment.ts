import type { CommentsModel } from '../models/comment'
import { Get } from '../ofetch'

export enum Commentkeys {
  getDanmu = 'getDanmu',
}

// 获取弹幕，withRelated=true 时包含第三方弹幕源（服务端已处理时间偏移）
function getDanmu(episodeId: number, params?: { chConvert?: number; withRelated?: boolean }) {
  return Get<CommentsModel>(`/comment/${episodeId}`, {
    withRelated: true,
    ...params,
  })
}

export const comment = {
  getDanmu,
  Commentkeys,
}
