import type { BangumiDetailResponseModel, BangumiShinResponseModel } from '../models/bangumi'
import { Get } from '../ofetch'

function getBangumiDetailById(animeId: number) {
  return Get<BangumiDetailResponseModel>(`/bangumi/${animeId}`)
}

function getBangumiShin() {
  return Get<BangumiShinResponseModel>(`/bangumi/shin`)
}

export const bangumi = {
  getBangumiDetailById,
  getBangumiShin,
}
