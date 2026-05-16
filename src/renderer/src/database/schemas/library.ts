export interface DB_LibraryEpisode {
  episodeId: number
  episodeNumber: number
  title: string
  airDate: string
  fileHash?: string
}

export interface DB_Library {
  animeId: number
  title: string
  imageUrl: string
  type: string
  typeDescription: string
  rating: number
  summary: string
  totalEpisodes: number
  airDate: string
  isOnAir: boolean
  tags: string[]
  intro: string
  episodes: DB_LibraryEpisode[]
  watchedEpisodeIds: number[]
  lastWatchedEpisodeId?: number
  lastWatchedAt: string
  addedAt: string
}
