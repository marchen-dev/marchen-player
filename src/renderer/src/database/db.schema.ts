import { TABLES } from './constants'

export const dbSchema = {
  [TABLES.HISTORY]:
    '&hash,animeId, episodeId, animeTitle, episodeTitle, progress, duration, cover,thumbnail, danmaku, newBangumi, updatedAt',
  [TABLES.LIBRARY]: '&animeId, lastWatchedAt, addedAt, rating, isOnAir',
}
