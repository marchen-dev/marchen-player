import type { MediaAudioTrack } from '@marchen/playback-core'
import type { CommentsModel } from '@renderer/request/models/comment'

export interface DB_History {
  audioTrack?: MediaAudioTrack
  hash: string
  source?:
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

export interface DB_Danmaku {
  // 'auto': 通过 API (withRelated=true) 自动获取的弹幕
  // 'local': 用户通过本地文件导入的弹幕
  type: 'auto' | 'local'
  source: string
  selected?: boolean
  content: CommentsModel
}
