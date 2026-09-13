import { describe, expect, it } from 'vitest'
import { isVideoFile } from './file-open'

describe('系统文件关联打开', () => {
  it.each(['/media/episode.mp4', 'C:\\Anime\\EP01.MKV'])('识别 mp4/mkv 文件关联：%s', (path) => {
    expect(isVideoFile(path)).toBe(true)
  })

  it.each(['/media/episode.ass', 'marchen://external/deep-link'])(
    '不把非视频或外部深链当作文件关联：%s',
    (path) => {
      expect(isVideoFile(path)).toBe(false)
    },
  )
})
