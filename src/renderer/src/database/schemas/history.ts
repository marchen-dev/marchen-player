import type { MediaAudioTrack } from '@marchen/playback-core'
import type { DanmakuEntry } from '@marchen/shared/danmaku'
import type { RemoteMediaSource } from '@marchen/shared/media'

export interface DB_History {
  audioTrack?: MediaAudioTrack
  hash: string
  source?:
    | RemoteMediaSource
    | {
        kind: 'web-file'
        name: string
        size: number
        lastModified?: number
        handle?: FileSystemFileHandle
      }
    | { kind: 'electron-file'; path: string; name: string; size: number }
  animeId?: number
  episodeId?: number
  animeTitle?: string
  episodeTitle?: string
  progress: number
  duration: number
  cover?: string
  thumbnail?: string
  danmaku?: DB_Danmaku[]
  newBangumi?: boolean
  subtitles?: DB_Subtitles
  updatedAt: string
}

interface DB_Subtitles {
  defaultId: number
  timeOffset?: number

  tags: Array<{
    id: number
    path?: string
    content?: string
    origin?: 'embedded' | 'external'
    embedded?: { number: number; uid: string; codec: string }
    title: string
    language?: string
  }>
}

export type DB_Danmaku = DanmakuEntry
