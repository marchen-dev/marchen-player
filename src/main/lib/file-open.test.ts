import { describe, expect, it } from 'vitest'
import { isVideoFile } from './file-open'

describe('系统文件关联打开', () => {
  it.each(['/media/episode.mp4', 'C:\\Anime\\EP01.MKV', '/media/片名.MOV', '/media/episode.webm', '/media/episode.m2ts', '/media/episode.m4v'])('识别视频容器文件关联：%s', (path) => {
    expect(isVideoFile(path)).toBe(true)
  })

  it.each(['/media/episode.ass', 'marchen://external/deep-link', '/media/movie.avi', '/media/music.mp3', '/folder.mp4/note', 'mp4'])(
    '不把非视频或外部深链当作文件关联：%s',
    (path) => {
      expect(isVideoFile(path)).toBe(false)
    },
  )
})
