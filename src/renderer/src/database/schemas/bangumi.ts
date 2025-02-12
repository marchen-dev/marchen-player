import type { BangumiModel } from '@renderer/request/models/bangumi'

export interface DB_Bangumi {
  animeId: number
  title: string
  newBangumi: boolean
  updatedAt: string
  detail: BangumiModel
  cover: string
}
