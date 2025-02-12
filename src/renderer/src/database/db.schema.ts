import { TABLES } from './constants'

export const dbSchemaV1 = {
  [TABLES.HISTORY]:
    '&hash,animeId, episodeId, path, animeTitle, episodeTitle, progress, duration, cover,thumbnail, danmaku, updatedAt',
}

export const dbSchemaV2 = {
  [TABLES.HISTORY]:
    '&hash,animeId, episodeId, path, animeTitle, episodeTitle, progress, duration, cover,thumbnail, danmaku, newBangumi, updatedAt',
}

export const dbSchemaV3 = {
  [TABLES.HISTORY]:
    '&hash,animeId, episodeId, path, animeTitle, episodeTitle, progress, duration, thumbnail, danmaku, updatedAt',
  [TABLES.BANGUMI]: '&animeId, title,cover,newBangumi,detail, updatedAt',
}
