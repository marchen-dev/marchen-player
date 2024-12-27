import { TABLES } from './constants'

export const dbSchemaV1 = {
  [TABLES.HISTORY]:
    '&hash,animeId, episodeId, path, animeTitle, episodeTitle, progress, duration, cover,thumbnail, danmaku, updatedAt',
}

export const dbSchemaV2 = {
  [TABLES.HISTORY]:
    '&hash,animeId, episodeId, path, animeTitle, episodeTitle, progress, duration, cover,thumbnail, danmaku, updatedAt',
}
