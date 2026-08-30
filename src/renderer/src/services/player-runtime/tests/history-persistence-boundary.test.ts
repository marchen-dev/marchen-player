import {
  assertPersistentMediaPath,
  isForbiddenPersistentMediaPath,
} from '@renderer/database/persistence/media-path'
import { describe, expect, it } from 'vitest'

describe('hISTORY 媒体路径持久化边界', () => {
  it.each([
    'marchen:///video.mkv',
    'blob:renderer-object-url',
    'http://127.0.0.1:3210/v1/media/token/g/1/index.m3u8',
    'http://localhost:3210/video.mp4',
    'file:///Users/test/video.mkv',
  ])('拒绝临时播放地址：%s', (value) => {
    expect(isForbiddenPersistentMediaPath(value)).toBe(true)
    expect(() => assertPersistentMediaPath({ path: value })).toThrow('原始文件路径')
  })

  it.each(['/Users/test/video.mkv', 'C:\\Media\\video.mkv', '\\\\server\\share\\video.mkv'])(
    '允许原始文件路径：%s',
    (value) => expect(() => assertPersistentMediaPath({ path: value })).not.toThrow(),
  )

  it('只允许 v5 明确标记的 unresolved 旧协议记录继续存在', () => {
    const path = 'marchen://ambiguous-video.mkv'
    expect(() =>
      assertPersistentMediaPath({
        path,
        pathStatus: 'unresolved',
        originalPath: path,
        pathMigrationError: '无法恢复',
      }),
    ).not.toThrow()
  })
})
