import type { ReponseBaseModel } from './base'

interface TitleModel {
  language: string
  title: string
}

interface EpisodeModel {
  seasonId: number | null
  episodeId: number
  episodeTitle: string
  episodeNumber: string
  lastWatched: string | null
  airDate: string
}

interface RatingDetailsModel {
  弹弹play连载中评分: number
  弹弹play完结后评分: number
  Bangumi评分: number
  Anidb连载中评分: number
  Anidb完结后评分: number
  Anidb评论员评分: number
}

interface RelatedAnimeModel {
  animeId: number
  bangumiId: string
  animeTitle: string
  imageUrl: string
  searchKeyword: string
  isOnAir: boolean
  airDay: number
  isFavorited: boolean
  isRestricted: boolean
  rating: number
}

interface TagModel {
  id: number
  name: string
  count: number
}

interface OnlineDatabaseModel {
  name: string
  url: string
}

interface TrailerModel {
  id: number
  url: string
  title: string
  imageUrl: string
  date: string
}

interface BangumiModel {
  type: string
  typeDescription: string
  titles: TitleModel[]
  seasons: any[]
  episodes: EpisodeModel[]
  summary: string
  metadata: string[]
  bangumiUrl: string
  userRating: number
  favoriteStatus: any
  comment: any
  ratingDetails: RatingDetailsModel
  relateds: RelatedAnimeModel[]
  similars: any[]
  tags: TagModel[]
  onlineDatabases: OnlineDatabaseModel[]
  trailers: TrailerModel[]
  animeId: number
  bangumiId: string
  animeTitle: string
  imageUrl: string
  searchKeyword: string
  isOnAir: boolean
  airDay: number
  isFavorited: boolean
  isRestricted: boolean
  rating: number
}

export interface BangumiDetailResponseModel extends ReponseBaseModel {
  bangumi: BangumiModel
}

export interface BangumiShinResponseModel extends ReponseBaseModel {
  bangumiList: Array<{
    animeId: number
    bangumiId: string
    animeTitle: string
    imageUrl: string
    searchKeyword: string
    isOnAir: boolean
    airDay: number
    isFavorited: boolean
    isRestricted: boolean
    rating: number
  }>
}
